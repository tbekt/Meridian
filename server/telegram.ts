/**
 * Live events from public Telegram channels, read through Telegram's public
 * web preview (https://t.me/s/<channel>) — no account or API key needed.
 *
 * Each post becomes one event (long multi-paragraph reports are split per
 * paragraph). Places named in the text are resolved with the GeoNames
 * gazetteer; the "X direction" a front report names is used as an anchor to
 * pick the right village among the many that share a name.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MapEvent } from '../src/types.ts';
import { regionFor } from '../src/data/regions.ts';
import { classifyReport, decodeEntities } from './classify.ts';
import { findAbroad, topicOf } from './countries.ts';
import { distanceKm, loadGazetteer, resolveFrontTown, UKRAINE_FRONT, type Gazetteer, type Place } from './gazetteer.ts';
import type { LiveFeed } from './gdelt.ts';
import { createTranslationService, detectLang, type TranslationService } from './translate.ts';
import { fetchXPosts, XApiError } from './x.ts';
import { fetchWebFeed, type WebFeedConfig } from './web.ts';

export interface ChannelConfig {
  /** channel / account username, e.g. "lumsrc" */
  name: string;
  /** Telegram channel (default) or X account */
  platform?: 'telegram' | 'x' | 'web';
  /** for news-site feeds (platform "web") */
  web?: WebFeedConfig;
  /** Home area as written in the config ("Kharkiv", "Ukraine"); resolved to `fallback` at startup. */
  area?: string;
  /**
   * Where posts that name no specific place go (approximate). Channels without
   * one (e.g. ones covering strikes anywhere in Russia) only show located posts.
   */
  fallback?: { lat: number; lng: number; name: string; country: string };
}

export interface TelegramOptions {
  channels: ChannelConfig[];
  cacheFile?: string;
  geonamesDir: string;
  translationCacheFile?: string;
  modelDir?: string;
  backlogDays?: number;
  pollMs?: number;
  /** X API bearer token; X accounts are skipped without one */
  xToken?: string;
  xPollMs?: number;
  /** how often to check news-site feeds */
  webPollMs?: number;
  log?: (m: string) => void;
}

export interface PostMedia {
  type: 'photo' | 'video';
  /** direct URL (X); Telegram URLs expire, so they're resolved through /api/media */
  url?: string;
  thumb?: string;
  /** false when Telegram only offers "view in Telegram" (large videos) */
  playable: boolean;
}

export interface Post {
  platform: 'telegram' | 'x' | 'web';
  channel: string;
  /** string: X ids exceed JavaScript's safe integer range */
  id: string;
  url: string;
  time: string;
  text: string;
  /** t.me/<channel>/<id> links found in the post */
  links: string[];
  media?: PostMedia[];
}

const KEEP_MS = 7 * 24 * 3_600_000;
const UA = 'Mozilla/5.0 (compatible; Meridian/0.1; +live event map)';

// ── Scraping ─────────────────────────────────────────────────────────────────
function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Photos and videos of one Telegram message, in display order. */
export function extractMedia(html: string): PostMedia[] {
  const out: PostMedia[] = [];
  const marker = /tgme_widget_message_(photo_wrap|video_player)/g;
  const hits = [...html.matchAll(marker)];
  hits.forEach((m, i) => {
    const chunk = html.slice(m.index!, hits[i + 1]?.index ?? html.length);
    const bg = chunk.match(/background-image:url\('([^']+)'\)/)?.[1];
    if (m[1] === 'photo_wrap') {
      if (bg) out.push({ type: 'photo', url: bg, playable: true });
    } else {
      const src = chunk.match(/<video[^>]*src="([^"]+)"/)?.[1];
      out.push({ type: 'video', url: src ? decodeEntities(src) : undefined, thumb: bg, playable: !!src });
    }
  });
  return out;
}

export function parseChannelPage(html: string, channel: string): Post[] {
  const posts: Post[] = [];
  for (const block of html.split('class="tgme_widget_message_wrap').slice(1)) {
    const ref = block.match(/data-post="([^"/]+)\/(\d+)"/);
    const time = block.match(/<time[^>]*datetime="([^"]+)"/)?.[1];
    const body = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    const media = extractMedia(block);
    // photo/video posts without a caption still count when they have media
    if (!ref || !time || (!body && !media.length)) continue;
    const links = [...(body ?? '').matchAll(/https?:\/\/t\.me\/([A-Za-z0-9_]+)\/(\d+)/g)].map((m) => `${m[1].toLowerCase()}/${m[2]}`);
    posts.push({
      platform: 'telegram',
      channel,
      id: ref[2],
      url: `https://t.me/${ref[1]}/${ref[2]}`,
      time: new Date(time).toISOString(),
      text: body ? htmlToText(body) : '',
      links,
      media: media.length ? media.map(({ type, playable }) => ({ type, playable })) : undefined,
    });
  }
  return posts;
}

async function fetchPage(channel: string, before?: string) {
  const url = `https://t.me/s/${channel}${before ? `?before=${before}` : ''}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return parseChannelPage(await res.text(), channel);
  } finally {
    clearTimeout(t);
  }
}

// ── Geocoding ────────────────────────────────────────────────────────────────
/** Named front sectors that aren't towns. */
const NORTH = { lat: 51.1, lng: 35.0, label: 'North Slobozhanskyi' };
const SOUTH = { lat: 50.25, lng: 36.95, label: 'South Slobozhanskyi' };
const DNIPRO = { lat: 46.75, lng: 32.9, label: 'Prydniprovske' };
const KURSK = { lat: 51.3, lng: 35.4, label: 'Kursk' };
const SECTORS: Record<string, { lat: number; lng: number; label: string }> = {
  'north slobozhansk': NORTH,
  'south slobozhansk': SOUTH,
  prydniprovs: DNIPRO,
  kursk: KURSK,
  'північно-слобожанськ': NORTH,
  'південно-слобожанськ': SOUTH,
  придніпровськ: DNIPRO,
  курськ: KURSK,
};

/** Colloquial oblast names ("на Донеччині") → rough centre, used when no village matches. */
const OBLASTS: [RegExp, { lat: number; lng: number; name: string }][] = [
  [/донеччин|donetsk (oblast|region)/i, { lat: 48.3, lng: 37.6, name: 'Donetsk Oblast' }],
  [/харківщин|kharkiv (oblast|region)/i, { lat: 49.7, lng: 36.6, name: 'Kharkiv Oblast' }],
  [/запоріжжі|запорізьк|zaporizhzhia (oblast|region)/i, { lat: 47.5, lng: 35.6, name: 'Zaporizhzhia Oblast' }],
  [/сумщин|sumy (oblast|region)/i, { lat: 51.0, lng: 34.4, name: 'Sumy Oblast' }],
  [/дніпропетровщин|дніпропетровськ|dnipropetrovsk (oblast|region)/i, { lat: 48.3, lng: 35.4, name: 'Dnipropetrovsk Oblast' }],
  [/херсонщин|kherson (oblast|region)/i, { lat: 46.8, lng: 33.2, name: 'Kherson Oblast' }],
  [/луганщин|luhansk (oblast|region)/i, { lat: 48.9, lng: 38.9, name: 'Luhansk Oblast' }],
  [/чернігівщин|chernihiv (oblast|region)/i, { lat: 51.3, lng: 32.4, name: 'Chernihiv Oblast' }],
  [/одещин|odesa (oblast|region)/i, { lat: 46.6, lng: 30.6, name: 'Odesa Oblast' }],
  [/миколаївщин|mykolaiv (oblast|region)/i, { lat: 47.2, lng: 31.9, name: 'Mykolaiv Oblast' }],
  [/київщин|kyiv (oblast|region)/i, { lat: 50.3, lng: 30.6, name: 'Kyiv Oblast' }],
  [/криму|крим\b|crimea/i, { lat: 45.2, lng: 34.2, name: 'Crimea' }],
];

/** Paragraphs reporting that nothing happened. */
const NOTHING = /(не проводи|не здійснюва|не зафіксовано|не відбувал|without (any )?(assault|attack)|no (assaults?|attacks?|clashes) (were|took))/i;
/** Thanks, greetings and sign-offs. */
const SIGN_OFF = /^(вдячність|дякуємо|слава україні|биймо ворога|тиждень, який)/i;
/** Awards, memorials and funerals: important locally, but not map events. */
const CEREMONY = /(нагородил|нагороди|відзнак|медал|вшанувал|вшанування|пам'ять|пам’ять|прощання|поховал|похорон|наградил|почтили|орден[а-я]* «)/i;
/** Donation and self-promotion posts. */
const PROMO = /(monobank|paypal|send\.mono|донат|підтримати канал|поддержать канал|реквізит|реквизит)/i;
/**
 * Ads and service announcements: grants, giveaways, discounts, sign-ups, and
 * posts that open with a question to the reader ("Do you have a small business…?").
 */
export const AD =
  /(грант|розіграш|розіграєм|знижк|скидк|умови участі|условия участия|подати заявку|подать заявку|долучайтеся до спільноти|детальніше про роботу|giveaway|discount|apply now)/i;
export const READER_QUESTION =
  /^[^\n.!?]{0,40}(?<!\p{L})(маєте|хочете|шукаєте|бажаєте|плануєте|потрібн[аеі]?|мрієте|знаєте, як|у вас є|есть ли у вас|хотите|ищете|нужн[аоы]?|do you|are you|looking for|want to)(?!\p{L})[^\n.!]{0,160}\?/iu;

/** Capitalised words that are never the place a post is about. */
const STOP = new Set(
  [
    'At In On Near The A An And Also Towards To From Of By Yesterday Today General Staff Armed Forces Reports Russian Russians Russia Ukraine Ukrainian Ukrainians Air Force Defense Defence Ministry President Iskander Shahed Gerbera Kh Su Mi Ka Tu Oblast Region District Direction Village Town City North South East West Slava Ukraini',
    'Breaking Urgent Nasser War Deir Beit Tel Khan Kafr Umm Abu Sheikh Bani Ein Ain Wadi Jabal Northern Southern Eastern Western Central Occupied Upper Lower Old New Greater Media Reports Sources Hebrew Arabic Al Jazeera Mayadeen Quds',
    'Iran Iranian Iraq Iraqi Israel Israeli Israelis Palestine Palestinian Palestinians Lebanon Lebanese Syria Syrian Yemen Yemeni Egypt Egyptian Jordan Jordanian Qatar Qatari Saudi Arabia Gulf Hamas Hezbollah Houthi Houthis IDF Army Navy US USA UN EU NATO Trump Netanyahu Strait Hormuz Red Sea West Bank Gaza Strip',
    // Ukrainian / Russian words that happen to be village names
    'Сил Сили Силами Силам Сила Україна України Україні Україну Слава Славу Перемогу Перемога Перемоги Збройних Збройні Генерального Генеральний Штаб Штабу ЗСУ Росія Росії Росію Оборони Ворог Противник Загалом Також Крім Окрім Протягом Учора Вчора Сьогодні Дякуємо Биймо Лише Вдячність Тиждень Паливо Повітряний ООН Статуту Нептун Іскандер Іскандерів Шахед Герань Гербера Пародія Підписатися',
    // Russian
    'Друзья Сообщается Также Сегодня Вчера Ночью Утром Около Россия России Россию Украина Украины Украину ВСУ Минус Источник Ранее Пожар Горит Взрыв Взрывы Атака Удар Подписаться Донаты',
  ]
    .join(' ')
    .split(' '),
);

/** Text describing where attacks were launched from — not where they happened. */
const LAUNCH_SITES = /(з напрямк\S*|із напрямк\S*|район(?:и)? пуску|launched from|from the directions? of)[^.)\n]*/gi;

const NAME_RE =
  /[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ'’ʼ]+(?:-[A-ZА-ЯІЇЄҐa-zа-яіїєґ][a-zа-яіїєґ'’ʼ]+)*(?:\s+[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ'’ʼ]+(?:-[A-ZА-ЯІЇЄҐa-zа-яіїєґ][a-zа-яіїєґ'’ʼ]+)*){0,2}/g;

interface Located {
  lat: number;
  lng: number;
  name: string;
  admin?: string;
  country: string;
  places: string[];
  precise: boolean;
  /** the text named a front direction */
  anchored: boolean;
}

const DIRECTION_EN = /(?:at|on)\s+(?:the\s+)?([A-Z][\w'’ -]+?)\s*(?:\(([^)]+)\))?\s+directions?/i;
const DIRECTION_UK = /на\s+([А-ЯІЇЄҐ][а-яіїєґ'’ʼ-]+)(?:\s+(?:та|і)\s+[А-ЯІЇЄҐ][а-яіїєґ'’ʼ-]+)?\s+напрямк\S*/i;

function findAnchor(
  text: string,
  g: Gazetteer,
  front: { lat: number; lng: number },
): { lat: number; lng: number; label: string } | null {
  const m = text.match(DIRECTION_EN) ?? text.match(DIRECTION_UK);
  if (!m) return null;
  const raw = m[1].trim();
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(SECTORS)) if (lower.startsWith(k)) return v;
  const best = resolveFrontTown(raw, g, front);
  return best ? { lat: best.lat, lng: best.lng, label: best.name } : null;
}

/**
 * Countries in the Middle East news: mentioned by name (English / Arabic / Hebrew),
 * they steer ambiguous place names ("الضاحية" in a Lebanon story is Beirut's
 * Dahiyeh) and give a country-level location when no town is named.
 */
const COUNTRIES: { name: string; re: RegExp; lat: number; lng: number }[] = [
  { name: 'Lebanon', re: /lebanon|lebanese|لبنان|اللبناني|לבנון/i, lat: 33.85, lng: 35.86 },
  { name: 'Syria', re: /syria|syrian|سوريا|سورية|السوري|סוריה/i, lat: 34.8, lng: 38.99 },
  { name: 'Yemen', re: /yemen|yemeni|houthi|اليمن|اليمني|صنعاء|תימן/i, lat: 15.55, lng: 48.52 },
  { name: 'Iran', re: /\biran(ian)?\b|tehran|إيران|ايران|الإيراني|طهران|איראן/i, lat: 32.43, lng: 53.69 },
  { name: 'Iraq', re: /\biraq(i)?\b|العراق|العراقي|עיראק/i, lat: 33.22, lng: 43.68 },
  { name: 'Jordan', re: /\bjordan(ian)?\b|الأردن|الاردن|ירדן/i, lat: 30.59, lng: 36.24 },
  { name: 'Egypt', re: /egypt(ian)?|مصر|المصري|מצרים/i, lat: 26.82, lng: 30.8 },
  { name: 'Palestine', re: /gaza|west bank|palestin|غزة|الضفة|فلسطين|עזה/i, lat: 31.95, lng: 35.2 },
  { name: 'Israel', re: /\bisrael(i)?\b|إسرائيل|اسرائيل|الإسرائيلي|ישראל/i, lat: 31.4, lng: 34.9 },
];

const LEVANT_COUNTRIES = new Set(['Israel', 'Palestine', 'Lebanon']);

/** Countries a Cyrillic-language post can be about. */
const UA_THEATRE = new Set(['Ukraine', 'Russia', 'Belarus', 'Moldova']);

/** Rough centre of Israel–Palestine, for disambiguating Arabic / Hebrew posts. */
const LEVANT = { lat: 31.8, lng: 35.0, name: 'Israel–Palestine', country: 'Israel' };

/** Arabic words that are also tiny place names somewhere. */
const STOP_AR = new Set(
  'الميادين الجزيرة الحرس الثوري ناقلات ناقلة مضيق هرمز الضفة القطاع الله الاحتلال العدو شهيد شهيدان شهداء الشهداء جرحى مصابين مصابون المسيرة عاجل مراسلنا الجيش جيش قوات القوات مصادر مصدر عاجل اليوم امس أمس الآن منذ بعد قبل خلال حتى شمال جنوب شرق غرب وسط مدينة بلدة مخيم قرية منطقة محافظة الشمال الجنوب الشرق الغرب حماس حزب انصار أنصار الله المقاومة الصهيوني الإسرائيلي الاسرائيلي إسرائيل اسرائيل فلسطين لبنان سوريا اليمن مصر الأردن العراق إيران ايران أمريكا امريكا الولايات المتحدة نتنياهو ترامب'.split(' '),
);

/** Stop words also come with attached prepositions: "بمدينة" (in the city), "والجيش" (and the army). */
function isArabicStop(word: string) {
  if (STOP_AR.has(word)) return true;
  const bare = word.replace(/^(وال|بال|فال|كال|لل|وب|ول|فب|فل|و|ف|ب|ل|ك)/, '');
  return bare.length >= 2 && (STOP_AR.has(bare) || STOP_AR.has('ال' + bare));
}

/** Candidate place names in Arabic / Hebrew text: no capital letters, so try every 1–3 word run. */
function scriptCandidates(text: string, g: Gazetteer) {
  const found: { word: string; candidates: Place[] }[] = [];
  const words = text.split(/[^\u0600-\u06FF\u0590-\u05FF]+/).filter(Boolean);
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let len = Math.min(3, words.length - i); len >= 1; len--) {
      const phrase = words.slice(i, i + len).join(' ');
      if (len === 1 && (isArabicStop(phrase) || phrase.length < 3)) break;
      // single words must be a real town (or any Israeli/Palestinian locality): too many
      // ordinary Arabic words are also the name of some hamlet
      const candidates = g
        .find(phrase)
        .filter((c) => c.kind === 'P' && (len > 1 || c.population >= 1000 || c.country === 'Israel' || c.country === 'Palestine'));
      if (candidates.length) {
        if (!found.some((f) => f.word === phrase)) found.push({ word: phrase, candidates });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return found;
}

/**
 * Gaza neighbourhoods, camps, hospitals and corridors that the news names all
 * the time but GeoNames lacks (or only knows under another spelling), in
 * English and Arabic. Without these "Nasser Medical Complex" finds a town in
 * Egypt and "Deir al-Balah" a port in Iran.
 */
const LANDMARKS: { name: string; admin: string; lat: number; lng: number; re: RegExp }[] = [
  { name: 'Deir al-Balah', admin: 'Gaza Strip', lat: 31.417, lng: 34.351, re: /Deir (?:al|el)[- ]Balah|دير البلح/gi },
  { name: 'Beit Lahia', admin: 'Gaza Strip', lat: 31.546, lng: 34.495, re: /Beit Lah(?:i|iy)a|بيت لاهيا/gi },
  { name: "Shuja'iyya", admin: 'Gaza City', lat: 31.5, lng: 34.47, re: /Shuja'?i?y?ya|Shejaiya|الشجاعية/gi },
  { name: 'Zeitoun', admin: 'Gaza City', lat: 31.492, lng: 34.442, re: /(?:al-)?Zeitoun|(?:al-)?Zaytoun|حي الزيتون/gi },
  { name: 'Tuffah', admin: 'Gaza City', lat: 31.512, lng: 34.474, re: /(?:al-)?Tuffah|حي التفاح/gi },
  { name: 'Sheikh Radwan', admin: 'Gaza City', lat: 31.535, lng: 34.466, re: /Sheikh Radwan|الشيخ رضوان/gi },
  { name: 'Tel al-Hawa', admin: 'Gaza City', lat: 31.505, lng: 34.435, re: /T[ae]l al-Hawa|تل الهوا/gi },
  { name: 'Al-Shifa Hospital', admin: 'Gaza City', lat: 31.524, lng: 34.444, re: /(?:al-)?Shifa (?:Medical Complex|Hospital)|مجمع الشفاء|مستشفى الشفاء/gi },
  { name: 'Al-Ahli Hospital', admin: 'Gaza City', lat: 31.505, lng: 34.462, re: /al-Ahli (?:Arab |Baptist )?Hospital|Baptist Hospital|المعمداني/gi },
  { name: 'Kamal Adwan Hospital', admin: 'Beit Lahia', lat: 31.551, lng: 34.509, re: /Kamal Adwan|كمال عدوان/gi },
  { name: 'Nuseirat', admin: 'Gaza Strip', lat: 31.448, lng: 34.393, re: /(?:al-)?Nuseirat/gi },
  { name: 'Maghazi', admin: 'Gaza Strip', lat: 31.421, lng: 34.385, re: /(?:al-)?Maghazi|المغازي/gi },
  { name: 'Al-Aqsa Martyrs Hospital', admin: 'Deir al-Balah', lat: 31.418, lng: 34.357, re: /al-Aqsa Martyrs|شهداء الأقصى/gi },
  { name: 'Nasser Hospital', admin: 'Khan Yunis', lat: 31.346, lng: 34.293, re: /Nasser (?:Medical Complex|Hospital)|مجمع ناصر|مستشفى ناصر/gi },
  { name: 'Netzarim Corridor', admin: 'Gaza Strip', lat: 31.47, lng: 34.42, re: /Netzarim|نتساريم/gi },
  { name: 'Philadelphi Corridor', admin: 'Rafah', lat: 31.262, lng: 34.25, re: /Philadelphi|فيلادلفيا/gi },
  { name: 'Al-Aqsa Mosque', admin: 'Jerusalem', lat: 31.776, lng: 35.236, re: /al-Aqsa Mosque|المسجد الأقصى/gi },
];

/** Words after a place name that confirm it's a place ("Rafah Crossing"), not a person. */
const PLACE_WORDS = new Set(
  'City Crossing Camp Governorate Strip Hospital Junction Street Roundabout Port Airport Province District Valley Refugee Border Island Heights Mosque Square Neighbourhood Neighborhood Gate Checkpoint Corridor Bridge Base Area Region Road Highway Municipality Village Town Settlement Outpost'.split(' '),
);

export function locate(text: string, g: Gazetteer, fallback: ChannelConfig['fallback']): Located {
  const rtl = /[\u0600-\u06FF\u0590-\u05FF]/.test(text);
  // disambiguate against the channel's area, or the region the language points to
  const home = fallback ?? (rtl ? LEVANT : { ...UKRAINE_FRONT, name: 'Ukraine', country: 'Ukraine' });
  const anchor = findAnchor(text, g, home);
  // candidate names, longest first so "Nove Zaporizhzhya" wins over "Nove"
  const found: { word: string; candidates: Place[] }[] = [];
  const seen = new Set<string>();
  // the direction's own town is the anchor, not the event location
  const scan = text
    .replace(new RegExp(DIRECTION_EN, 'gi'), ' ')
    .replace(new RegExp(DIRECTION_UK, 'gi'), ' ')
    .replace(LAUNCH_SITES, ' ');
  // Latin-script posts about the Middle East (English-language channels and sites)
  const cyrillicText = /[а-яіїєґё]/i.test(text);
  const levant = !cyrillicText && (rtl || !UA_THEATRE.has(home.country));
  let rest = scan;
  if (levant) {
    for (const l of LANDMARKS) {
      if (!l.re.test(rest)) continue;
      l.re.lastIndex = 0;
      rest = rest.replace(l.re, ' ');
      found.push({
        word: l.name,
        candidates: [{ name: l.name, admin: l.admin, lat: l.lat, lng: l.lng, country: 'Palestine', population: 50_000, kind: 'P', primary: [] }],
      });
    }
  }
  if (rtl) found.push(...scriptCandidates(rest, g));
  // Ukrainian / Russian posts are about that war: "Дань-Т" (a missile) is not Kibbutz Dan in Israel
  const cyrillic = /[а-яіїєґё]/i.test(scan);
  for (const m of rest.matchAll(NAME_RE)) {
    const words = m[0].split(/\s+/);
    const after = rest.slice(m.index! + m[0].length, m.index! + m[0].length + 24);
    let i = 0;
    while (i < words.length) {
      let matched = false;
      for (let len = Math.min(3, words.length - i); len >= 1; len--) {
        const phrase = words.slice(i, i + len).join(' ');
        if (len === 1 && STOP.has(phrase)) break;
        const candidates = g.find(phrase).filter(
          (p) =>
            p.kind === 'P' &&
            (!cyrillic || UA_THEATRE.has(p.country)) &&
            // English posts about the Middle East: not a namesake in Russia or Ukraine, and a
            // lone word must be a real town unless it's in Israel, Palestine or Lebanon
            (!levant || rtl || (!UA_THEATRE.has(p.country) && (len > 1 || p.population >= 1000 || LEVANT_COUNTRIES.has(p.country)))),
        );
        // "Олега Начуйченка": a first name followed by a surname is a person, not the village Oleh
        const next = words[i + len];
        const isPerson =
          len === 1 && !!next && /^[А-ЯІЇЄҐ]/.test(next) && !g.find(next).some((p) => p.kind === 'P') &&
          /(а|я|ого|ія)$/.test(phrase) && /(ка|ко|ук|юк|ич|ова|ого|енка|ського)$/.test(next);
        // "Avigdor Liberman", "Mohammed Deif": a lone match next to another capitalised word that
        // isn't a place is part of a person's name; '"Alon" Battalion' is a unit
        const prev = words[i - 1];
        const other = (w: string | undefined) =>
          !!w && !STOP.has(w) && !PLACE_WORDS.has(w) && !g.find(w).some((p) => p.kind === 'P');
        const isName =
          levant && !rtl && len === 1 && (other(next) || other(prev) || (i + len === words.length && /^["”'’]?\s+(Battalion|Brigade|Division|Unit|Company)/.test(after)));
        if (candidates.length && !isPerson && !isName) {
          if (!seen.has(phrase)) found.push({ word: phrase, candidates });
          seen.add(phrase);
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) i++;
    }
  }

  // Reference point: the direction anchor, else the centroid of unambiguous
  // matches, else the channel's default.
  let ref: { lat: number; lng: number } | null = anchor;
  if (!ref) {
    const sure = found.filter((f) => f.candidates.length === 1).map((f) => f.candidates[0]);
    if (sure.length) ref = { lat: avg(sure.map((p) => p.lat)), lng: avg(sure.map((p) => p.lng)) };
  }
  ref ??= home;

  const mentioned = new Set(COUNTRIES.filter((c) => c.re.test(text)).map((c) => c.name));
  const chosen: Place[] = [];
  for (const f of found) {
    // A story about Lebanon that mentions "الضاحية" means Beirut's Dahiyeh, not the
    // Palestinian hamlet of the same name: drop small places in countries the text doesn't mention.
    if (mentioned.size && f.candidates.every((c) => !mentioned.has(c.country) && c.population < 5000)) continue;
    // nearest to the reference point; without an anchor a real town beats a namesake hamlet
    const score = (c: Place) =>
      distanceKm(c, ref!) - (anchor ? 0 : 30 * Math.log10(c.population + 1)) - (mentioned.has(c.country) ? 400 : 0);
    const best = [...f.candidates].sort((a, b) => score(a) - score(b))[0];
    // a name that only exists far from the action is probably a false match
    // (Middle East channels range wider: Yemen and Iran are part of the story)
    if (distanceKm(best, ref) <= (anchor ? 90 : rtl ? 2500 : 250)) chosen.push(best);
  }

  if (chosen.length) {
    // the first place listed is the headline location; others are context
    const first = chosen[0];
    const spread = Math.max(...chosen.map((p) => distanceKm(p, first)));
    const centre = spread < 50 && chosen.length > 1
      ? { lat: avg(chosen.map((p) => p.lat)), lng: avg(chosen.map((p) => p.lng)) }
      : first;
    return {
      ...centre,
      name: first.name,
      admin: first.admin,
      country: first.country,
      places: chosen.map((p) => p.name),
      precise: true,
      anchored: !!anchor,
    };
  }
  if (anchor) {
    return { lat: anchor.lat, lng: anchor.lng, name: `${anchor.label} direction`, country: home.country, places: [], precise: false, anchored: true };
  }
  // only a country named (Middle East news): place the story at the country, approximately
  const country = rtl || !fallback ? COUNTRIES.find((c) => c.re.test(text)) : undefined;
  if (country && !/[а-яіїєґ]/i.test(text)) {
    return { lat: country.lat, lng: country.lng, name: country.name, country: country.name, places: [], precise: false, anchored: true };
  }
  const oblast = OBLASTS.find(([re]) => re.test(text))?.[1];
  if (oblast) {
    return { lat: oblast.lat, lng: oblast.lng, name: oblast.name, country: 'Ukraine', places: [], precise: false, anchored: true };
  }
  // a city-level home area (e.g. a Kharkiv news channel) is a meaningful location;
  // a country-level one isn't, so those posts still need a place of their own
  const cityArea = !!fallback && fallback.name !== fallback.country;
  return { lat: home.lat, lng: home.lng, name: home.name, country: home.country, places: [], precise: false, anchored: cityArea };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** "Kharkiv" → the city; "Ukraine" → country-level (front line used to disambiguate). */
export function resolveArea(area: string, g: Gazetteer): ChannelConfig['fallback'] | null {
  if (/^ukraine$/i.test(area.trim())) return { ...UKRAINE_FRONT, name: 'Ukraine', country: 'Ukraine' };
  // other country names: country-level home (used to disambiguate, not to place posts)
  const country = COUNTRIES.find((c) => c.name.toLowerCase() === area.trim().toLowerCase());
  if (country) return { lat: country.lat, lng: country.lng, name: country.name, country: country.name };
  const hits = g.find(area.trim()).filter((p) => p.kind === 'P');
  if (!hits.length) return null;
  const best = [...hits].sort(
    (a, b) => (b.country === 'Ukraine' ? 1 : 0) - (a.country === 'Ukraine' ? 1 : 0) || b.population - a.population,
  )[0];
  return { lat: best.lat, lng: best.lng, name: best.name, country: best.country };
}

/**
 * Media for the client. Telegram's CDN links carry expiring tokens, so they go
 * through /api/media (which looks up a fresh link); X links are stable.
 */
function eventMedia(post: Post): MapEvent['media'] {
  if (!post.media?.length) return undefined;
  return post.media.map((m, i) => {
    if (post.platform !== 'telegram') return { type: m.type, url: m.url ?? '', thumb: m.thumb, playable: m.playable };
    const base = `/api/media/tg/${encodeURIComponent(post.channel)}/${post.id}/${i}`;
    return {
      type: m.type,
      url: m.playable ? base : '',
      thumb: m.type === 'video' ? `${base}?thumb=1` : base,
      playable: m.playable,
    };
  });
}

/** Something happened: attacks, strikes, explosions, shoot-downs, casualties, alerts. */
const EVENT_WORDS =
  /(атак|удар|обстр|вибух|взрыв|прил[еёі]т|сбит|сбил|збит|збил|подавл|уражен|поражен|пожар|пожеж|горит|горять|горят|штурм|наступ|тревог|тривог|загиб|погиб|ранен|поранен|убит|вбит|evacuat|attack|strike|struck|explosion|blast|shot down|intercept|killed|wounded|shelling|clash|assault|fire at|hit by|غار|قصف|استهد|صاروخ|صواريخ|مسير|انفجار|اشتباك|اقتحام|شهيد|شهداء|استشهاد|إصاب|اصاب|جرحى|اعتراض|صفارات|إنذار|انذار|حريق|توغل|قنص|اغتيال)/i;

/** Casualty / equipment-loss tallies are statistics, not map events. */
const LOSSES = /(втрати|втратили|бойові втрати|потери|losses of the enemy|enemy losses)/i;

// ── Post → events ───────────────────────────────────────────────────────────
/** Strip boilerplate: trailing source lines, links, hashtags, subscribe prompts. */
function tidy(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b(t|telegram)\.me\/\S+/gi, '')
    // emoji decorations (⭕️🔴🆕💥) don't belong in map titles
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F100}-\u{1F1FF}]/gu, '')
    // Arabic channel signatures and the "urgent" label: "🔖 قناة المسيرة الفضائية", "عاجل |"
    .replace(/[^\n]*قناة المسيرة[^\n]*/g, '')
    .replace(/^[^\p{L}\d]*عاجل[^\p{L}\d]*/u, '')
    .replace(/[-–—,]?\s*-?\s*General Staff of Armed Forces of Ukraine reports\s*$/i, '')
    .replace(/(Підписатися|Підпишись|Подписаться|Подпишись|Subscribe)[^\n]*$/gim, '')
    // channel promo lines: "Ми в WhatsApp Instagram TikTok Threads"
    .replace(/^.*\b(WhatsApp|Instagram|TikTok|Threads|YouTube)\b.*$/gim, '')
    .replace(/#\S+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*,\s*$/, '')
    .trim();
}

function firstSentence(text: string, max = 220) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const at = Math.max(0, lines.findIndex((l) => l.length > 12));
  let line = lines[at] ?? text;
  // a lead-in ("IDF:", "مراسل الميادين في اليمن:") isn't a headline by itself: add what follows
  if (/[:：]$/.test(line) && line.length < 70 && lines[at + 1]) line = `${line} ${lines[at + 1].replace(/^["“«]/, '')}`;
  // a sentence ends at . ! ? followed by a capital — not at "c." or "p.m." inside brackets
  const s = line.match(/^(.{30,}?[^.\s(]{2}[.!?])(?=\s+["“«(]?[A-ZА-ЯІЇЄҐ0-9]|$)/)?.[1] ?? line;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s.trim();
}

export function postToEvents(
  post: Post,
  g: Gazetteer,
  cfg: ChannelConfig,
  refs: Map<string, string>,
  tr?: TranslationService,
): MapEvent[] {
  const body = tidy(post.text);
  if (body.length < 12) return []; // short is fine: "❗️ТРИВОГА В ЗАПОРІЖЖІ" is an event
  // long reports: one event per paragraph that names a place
  if (PROMO.test(body) || AD.test(body) || READER_QUESTION.test(body.trim()) || CEREMONY.test(body.slice(0, 200))) return [];
  // Split long multi-sector reports (General Staff style: a paragraph per front
  // direction) into one event per paragraph; ordinary news posts stay whole.
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 40);
  const sectorParagraphs = paragraphs.filter((p) => /напрямк|направлени|\bdirection\b/i.test(p)).length;
  const parts = body.length > 600 && sectorParagraphs >= 2 ? paragraphs : [body];
  const out: MapEvent[] = [];
  // Without a city-level home area (none, or just a country), a place only counts
  // when it's named in the same sentence as something actually happening:
  // commentary channels and general news sites mention places all the time.
  const strict = !cfg.fallback || cfg.fallback.name === cfg.fallback.country;
  parts.forEach((part, i) => {
    let where = part;
    // News from outside the war zones goes on that country: a statement by its
    // government (even about a strike elsewhere), or something happening there.
    // Judged from the headline, so a country named in passing doesn't count.
    const headline = part.split(/(?<=[.!?])\s+|\n+/)[0] ?? part;
    const topic = topicOf(part);
    const hint = topic ? findAbroad(headline) : null;
    if (strict) {
      // a sentence ends at . ! ? before a capital letter, or at a line break
      // ("порт Усть-Луга.. пожар продолжается" is still one sentence)
      const sentences = part.split(/(?<=[.!?])\s+(?=["«(]?[A-ZА-ЯІЇЄҐЁ])|\n+/);
      const eventful = sentences.filter((s) => EVENT_WORDS.test(s));
      // diplomatic news has no "event" sentence: it still counts when it is
      // about another country ("Зеленський прибув до ОАЕ")
      if (!eventful.length && !hint) return;
      where = eventful.length ? eventful.join(' ') : headline;
    }
    let loc = locate(where, g, cfg.fallback);
    // a statement always goes to the speaker; "in <country>" only when no town was named
    const abroad = hint && (hint.via === 'speaker' || (!loc.precise && !loc.name.endsWith(' direction'))) ? hint : null;
    if (abroad) {
      const c = abroad.country;
      loc = { lat: c.lat, lng: c.lng, name: c.capital, country: c.name, places: [], precise: false, anchored: true };
    }
    let category = classifyReport(part);
    // a government commenting on a strike is diplomacy, not the strike itself
    if (category && abroad?.via === 'speaker') category = 'politics';
    // Local news channels also post weather, appointments and appeals: keep war-related posts only.
    if (!category) return;
    // ... and such posts only show when they name a place (or a front sector / country).
    if (strict && !loc.precise && !loc.anchored) return;
    // Skip statistics, "nothing happened" lines, thanks and sign-offs, and
    // general posts that can't be placed anywhere more specific than the country.
    if (NOTHING.test(part) || SIGN_OFF.test(part.trim())) return;
    if (parts.length > 1 && LOSSES.test(part)) return;
    if (!loc.precise && !loc.anchored && category === 'politics') return;
    if (parts.length > 1 && i > 0 && !loc.precise && !loc.anchored) return;
    const sources: MapEvent['sources'] = [
      post.platform === 'web'
        ? { name: cfg.web?.label ?? post.channel, url: post.url, kind: 'media' }
        : { name: `@${post.channel}`, url: post.url, kind: post.platform === 'x' ? 'x' : 'telegram' },
    ];
    for (const l of post.links) {
      const [ch, id] = l.split('/');
      if (ch !== post.channel.toLowerCase() && !sources.some((s) => s.url.toLowerCase().endsWith(`/${ch}/${id}`))) {
        sources.push({ name: `@${refs.get(ch) ?? ch}`, url: `https://t.me/${refs.get(ch) ?? ch}/${id}`, kind: 'telegram' });
      }
    }
    // Non-English posts: show the English translation when it's ready (the
    // feed translates in the background), and keep the original alongside.
    const lang = detectLang(part);
    const english = lang && tr ? tr.get(part) : null;
    const shown = english ?? part;
    const title = firstSentence(shown);
    out.push({
      id: `${post.platform === 'x' ? 'x' : post.platform === 'web' ? 'w' : 't'}-${post.channel.toLowerCase()}-${post.id}${parts.length > 1 ? `-${i}` : ''}`,
      title,
      summary: shown.length > title.length + 10 ? shown : undefined,
      original: lang ? { text: part, lang } : undefined,
      // the post's photos/videos go with its first event
      media: i === 0 ? eventMedia(post) : undefined,
      translatedBy: english && tr!.engine !== 'off' ? tr!.engine : undefined,
      category,
      region: regionFor(loc.lat, loc.lng),
      // shown on the war's own tab too, although it's located elsewhere
      topic: abroad ? topic : undefined,
      location: {
        name: loc.name,
        admin: loc.admin,
        country: loc.country,
        lat: loc.lat,
        lng: loc.lng,
        precision: loc.precise ? 'exact' : 'approximate',
      },
      time: post.time,
      sources,
      verified: false,
      origin: post.platform,
      provenance: abroad
        ? abroad.via === 'speaker'
          ? `A statement or decision by ${abroad.country.name}; shown at ${abroad.country.capital}.`
          : `The post is about ${abroad.country.name}; shown at ${abroad.country.capital} (approximate).`
        : loc.precise
        ? `Places matched in the post: ${loc.places.slice(0, 8).join(', ')}${loc.places.length > 8 ? '…' : ''}.`
        : `No village could be matched; shown at ${loc.name} (approximate).`,
    });
  });
  return out;
}

// ── Feed ─────────────────────────────────────────────────────────────────────
interface Cache {
  version: 1;
  posts: Post[];
}

/** The social feed also resolves fresh Telegram media links (they expire). */
export interface SocialFeed extends LiveFeed {
  mediaUrl(channel: string, id: string, index: number, thumb: boolean): Promise<string | null>;
}

export function startTelegramFeed(opts: TelegramOptions): SocialFeed {
  const log = opts.log ?? ((m: string) => console.log(`[telegram] ${m}`));
  const pollMs = opts.pollMs ?? 2 * 60_000;
  const backlogMs = (opts.backlogDays ?? 7) * 24 * 3_600_000;
  const posts = new Map<string, Post>(); // "channel/id" → post
  const events = new Map<string, { event: MapEvent; updatedAt: number }>();
  const platformOf = (c: ChannelConfig) => c.platform ?? 'telegram';
  const cfgByName = new Map(opts.channels.map((c) => [`${platformOf(c)}:${c.name.toLowerCase()}`, c]));
  // channel username spelling, for links to relayed Telegram posts
  const canonical = new Map(opts.channels.filter((c) => platformOf(c) === 'telegram').map((c) => [c.name.toLowerCase(), c.name]));
  const tgChannels = opts.channels.filter((c) => platformOf(c) === 'telegram');
  const xAccounts = opts.channels.filter((c) => platformOf(c) === 'x');
  const webFeeds = opts.channels.filter((c) => platformOf(c) === 'web' && c.web);
  let gazetteer: Gazetteer | null = null;
  let translator: TranslationService | undefined;
  let loading = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  let xTimer: ReturnType<typeof setInterval> | undefined;
  let webTimer: ReturnType<typeof setInterval> | undefined;

  const key = (p: Post) => `${p.platform === 'telegram' ? '' : `${p.platform}:`}${p.channel.toLowerCase()}/${p.id}`;

  /** Rebuild events from posts. Posts another channel already relays are skipped. */
  const rebuild = () => {
    if (!gazetteer) return;
    const relayed = new Set<string>();
    for (const p of posts.values()) for (const l of p.links) if (!l.startsWith(`${p.channel.toLowerCase()}/`)) relayed.add(l);
    const now = Date.now();
    const next = new Set<string>();
    // Channels often re-post the same text (album edits, reposts): one event per
    // channel + text within 6 hours, the earliest post winning.
    const seenText = new Map<string, number>();
    const ordered = [...posts.values()].sort((a, b) => a.time.localeCompare(b.time));
    for (const p of ordered) {
      if (relayed.has(key(p))) continue;
      const cfg = cfgByName.get(`${p.platform}:${p.channel.toLowerCase()}`);
      if (!cfg) continue;
      for (const e of postToEvents(p, gazetteer, cfg, canonical, translator)) {
        const textKey = `${p.channel.toLowerCase()}|${(e.original?.text ?? e.title).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 120)}`;
        const t = +new Date(e.time);
        const prev = seenText.get(textKey);
        if (prev !== undefined && t - prev < 6 * 3_600_000) continue;
        seenText.set(textKey, t);
        next.add(e.id);
        const current = events.get(e.id);
        if (!current) events.set(e.id, { event: e, updatedAt: now });
        else if (e.media && e.media.length > (current.event.media?.length ?? 0)) {
          current.event.media = e.media;
          current.updatedAt = now;
        }
      }
    }
    for (const id of events.keys()) if (!next.has(id)) events.delete(id);
  };

  /** Translate events still showing non-English text, newest first; clients pick up the update. */
  let translating = false;
  let stopped = false;
  const translatePending = async () => {
    if (stopped || translating || !translator || translator.engine === 'off' || !gazetteer) return;
    translating = true;
    try {
      const pending = [...events.values()]
        .filter((s) => s.event.original && !s.event.translatedBy)
        .sort((a, b) => b.event.time.localeCompare(a.event.time));
      let done = 0;
      for (const s of pending) {
        if (stopped) break;
        const o = s.event.original!;
        const english = await translator.ensure(o.text, o.lang as 'uk' | 'ru', gazetteer);
        if (!english) continue;
        const title = firstSentence(english);
        s.event.title = title;
        s.event.summary = english.length > title.length + 10 ? english : undefined;
        s.event.translatedBy = translator.engine as 'claude' | 'local';
        s.updatedAt = Date.now();
        done++;
      }
      if (done) log(`translated ${done} posts (${translator.engine})`);
    } finally {
      translating = false;
    }
  };

  const addPosts = (list: Post[]) => {
    let added = 0;
    const cutoff = Date.now() - KEEP_MS;
    for (const p of list) {
      if (+new Date(p.time) < cutoff) continue;
      const existing = posts.get(key(p));
      if (existing) {
        // posts cached before media support: fill in their photos/videos
        if (p.media && p.media.length > (existing.media?.length ?? 0)) {
          existing.media = p.media;
          added++;
        }
        continue;
      }
      posts.set(key(p), p);
      added++;
    }
    return added;
  };

  const persist = async () => {
    if (!opts.cacheFile) return;
    try {
      await mkdir(dirname(opts.cacheFile), { recursive: true });
      const data: Cache = { version: 1, posts: [...posts.values()] };
      await writeFile(`${opts.cacheFile}.tmp`, JSON.stringify(data));
      await rename(`${opts.cacheFile}.tmp`, opts.cacheFile);
    } catch (e) {
      log(`cache write failed: ${(e as Error).message}`);
    }
  };

  const pollChannel = async (cfg: ChannelConfig, backfill: boolean) => {
    try {
      let page = await fetchPage(cfg.name);
      let added = addPosts(page);
      // walk back through history on first start
      const oldestWanted = Date.now() - backlogMs;
      for (let i = 0; backfill && i < 15 && page.length; i++) {
        const oldest = page.reduce((a, b) => (BigInt(a.id) < BigInt(b.id) ? a : b));
        if (+new Date(oldest.time) < oldestWanted) break;
        page = await fetchPage(cfg.name, oldest.id);
        added += addPosts(page);
        await new Promise((r) => setTimeout(r, 800)); // be gentle
      }
      if (added) log(`@${cfg.name}: +${added} posts`);
      return added;
    } catch (e) {
      log(`@${cfg.name}: ${(e as Error).message}`);
      return 0;
    }
  };

  /** New posts from one X account (only ones newer than the last seen — X bills per post read). */
  const pollX = async (cfg: ChannelConfig) => {
    if (!opts.xToken) return 0;
    let newest: bigint | null = null;
    for (const p of posts.values()) {
      if (p.platform === 'x' && p.channel.toLowerCase() === cfg.name.toLowerCase()) {
        const id = BigInt(p.id);
        if (newest === null || id > newest) newest = id;
      }
    }
    try {
      const fresh = await fetchXPosts(cfg.name, opts.xToken, newest?.toString(), newest ? 25 : 40);
      const added = addPosts(fresh);
      if (added) log(`x/@${cfg.name}: +${added} posts`);
      return added;
    } catch (e) {
      log(`x/@${cfg.name}: ${(e as Error).message}`);
      if (e instanceof XApiError && e.status === 401) xDisabled = true;
      return 0;
    }
  };
  let xDisabled = false;

  const afterNewPosts = async (added: number) => {
    if (!added) return;
    rebuild();
    void translatePending();
    await persist();
  };

  const pollAll = async (backfill: boolean) => {
    let added = 0;
    for (const c of tgChannels) added += await pollChannel(c, backfill);
    await afterNewPosts(added);
  };

  /** News sites: their feeds list the latest articles; new ones are added. */
  const pollAllWeb = async () => {
    let added = 0;
    for (const c of webFeeds) {
      try {
        const n = addPosts(await fetchWebFeed(c.web!));
        if (n) log(`${c.web!.label}: +${n} articles`);
        added += n;
      } catch (e) {
        log(`${c.web!.label}: ${(e as Error).message}`);
      }
    }
    await afterNewPosts(added);
  };

  const pollAllX = async () => {
    if (!opts.xToken || xDisabled) return;
    let added = 0;
    for (const c of xAccounts) added += await pollX(c);
    await afterNewPosts(added);
  };

  // Fresh Telegram media links, looked up from the post's embed page and kept briefly.
  const mediaCache = new Map<string, { at: number; media: PostMedia[] }>();
  const mediaUrl = async (channel: string, id: string, index: number, thumb: boolean) => {
    const k = `${channel.toLowerCase()}/${id}`;
    let entry = mediaCache.get(k);
    if (!entry || Date.now() - entry.at > 20 * 60_000) {
      const res = await fetch(`https://t.me/${channel}/${id}?embed=1&mode=tme`, { headers: { 'User-Agent': UA } });
      if (!res.ok) return null;
      entry = { at: Date.now(), media: extractMedia(await res.text()) };
      mediaCache.set(k, entry);
      if (mediaCache.size > 500) mediaCache.delete(mediaCache.keys().next().value!);
    }
    const m = entry.media[index];
    if (!m) return null;
    return (thumb ? m.thumb ?? m.url : m.url ?? m.thumb) ?? null;
  };

  (async () => {
    if (opts.cacheFile) {
      try {
        const data = JSON.parse(await readFile(opts.cacheFile, 'utf8')) as Cache;
        // older caches stored numeric ids and no platform
        if (data.version === 1) addPosts(data.posts.map((p) => ({ ...p, id: String(p.id), platform: p.platform ?? 'telegram' })));
      } catch {
        /* first run */
      }
    }
    gazetteer = await loadGazetteer(opts.geonamesDir, log);
    for (const c of opts.channels) {
      if (!c.area || c.fallback) continue;
      c.fallback = resolveArea(c.area, gazetteer) ?? undefined;
      if (!c.fallback) log(`@${c.name}: home area "${c.area}" not found — only located posts will show`);
    }
    translator = await createTranslationService({
      cacheFile: opts.translationCacheFile ?? '.cache/translations.json',
      modelDir: opts.modelDir ?? '.cache/models',
      log,
    });
    rebuild();
    void translatePending();
    await pollAll(true);
    loading = false;
    if (xAccounts.length && !opts.xToken) {
      log(`X accounts (${xAccounts.map((c) => '@' + c.name).join(', ')}) need X_BEARER_TOKEN — skipped`);
    }
    await pollAllX();
    await pollAllWeb();
    log(`${events.size} events from ${opts.channels.map((c) => platformOf(c) === 'web' ? c.web?.label ?? c.name : (platformOf(c) === 'x' ? 'x/@' : '@') + c.name).join(', ')}`);
    timer = setInterval(() => void pollAll(false), pollMs);
    if (opts.xToken && xAccounts.length) xTimer = setInterval(() => void pollAllX(), opts.xPollMs ?? 5 * 60_000);
    if (webFeeds.length) webTimer = setInterval(() => void pollAllWeb(), opts.webPollMs ?? 5 * 60_000);
  })().catch((e) => {
    loading = false;
    log(`startup failed: ${(e as Error).message}`);
  });

  return {
    since(cursor) {
      const now = Date.now();
      const out: MapEvent[] = [];
      for (const s of events.values()) if (s.updatedAt > cursor) out.push(s.event);
      return { events: out, cursor: now };
    },
    status: () => ({ slotsLoaded: posts.size, events: events.size, latestSlot: null, backfilling: loading }),
    mediaUrl,
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (xTimer) clearInterval(xTimer);
      if (webTimer) clearInterval(webTimer);
    },
  };
}
