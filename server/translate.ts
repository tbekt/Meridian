/**
 * Ukrainian / Russian → English translation for channel posts.
 *
 * Two engines:
 *  - "claude": Claude via the Anthropic API — best quality, keeps place names
 *    and military terms intact. Used automatically when ANTHROPIC_API_KEY is set.
 *  - "local": Helsinki-NLP opus-mt models running in-process with
 *    transformers.js. Free and offline after a one-time ~150 MB download.
 *    Place names are masked with placeholder letters before translation
 *    (the model otherwise translates "Світле" as "Light") and restored after.
 *
 * Choose with TRANSLATE_ENGINE=claude|local|off.
 */
import Anthropic from '@anthropic-ai/sdk';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { distanceKm, resolveFrontTown, UKRAINE_FRONT, type Gazetteer } from './gazetteer.ts';
import { transliterate } from './translit.ts';
import { decodeEntities } from './classify.ts';

export type { Lang } from './translit.ts';
import type { Lang } from './translit.ts';

/** Cache versions — bump when a translator's prompt or rules change. */
const CLAUDE_VERSION = 3;
const LOCAL_VERSION = 17;
export type Engine = 'claude' | 'local';

export interface Translator {
  readonly engine: Engine;
  translate(text: string, lang: Lang, g: Gazetteer): Promise<string>;
}

/** Ukrainian has і/ї/є/ґ; Russian has ы/э/ъ/ё. */
export function detectLang(text: string): Lang | null {
  const arabic = text.match(/[\u0600-\u06FF]/g)?.length ?? 0;
  if (arabic >= text.length / 4) return 'ar';
  const cyr = text.match(/[а-яіїєґёыэъ]/gi)?.length ?? 0;
  if (cyr < text.length / 4) return null;
  const uk = text.match(/[іїєґ]/gi)?.length ?? 0;
  const ru = text.match(/[ыэъё]/gi)?.length ?? 0;
  return uk >= ru ? 'uk' : 'ru';
}

// ── Claude ───────────────────────────────────────────────────────────────────
const SYSTEM = `You translate posts from Ukrainian, Russian, Arabic and Hebrew military and news channels into English for a live conflict map.

Translate faithfully and completely; don't summarise, add commentary or soften anything. Keep numbers, dates and units exactly.
Never translate a name by its meaning. Write every proper name — places, front sectors, military units and brigades, weapons and equipment, people, organisations — in the Latin alphabet: the standard English spelling where one is established (Pokrovsk, Kostiantynivka, Huliaipole, Iskander-M, Shahed, Kalibr, S-400), otherwise a transliteration of the original (e.g. "Поліська бригада" → "Poliska brigade", "Пародія" → "Parodiia"). Render named front sectors as "<Name> direction" (e.g. "Pokrovsk direction", "South Slobozhanskyi direction").
Use the usual English terms: "БпЛА" → "drones" (or "UAVs"), "КАБ" → "guided aerial bombs", "РСЗВ" → "MLRS", "противник"/"ворог" → "the enemy", "Сили оборони" → "the Defense Forces", "ТОТ" → "temporarily occupied territory".
Reply with the translation only.`;

function createClaudeTranslator(): Translator {
  const client = new Anthropic();
  return {
    engine: 'claude',
    async translate(text) {
      const response = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        // Translation is straightforward; low effort keeps it quick and cheap.
        output_config: { effort: 'low' },
        // If the model declines (e.g. graphic war content), retry on another model server-side.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: text }],
      });
      if (response.stop_reason === 'refusal') throw new Error('translation declined');
      const out = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (!out) throw new Error('empty translation');
      return out;
    },
  };
}

// ── Local (opus-mt) ──────────────────────────────────────────────────────────
type Pipe = (text: string, opts?: Record<string, unknown>) => Promise<{ translation_text: string }[]>;

/** Placeholder letters the model reliably copies through unchanged. */
const SLOTS = ['X', 'Y', 'Z', 'W', 'Q', 'V', 'J', 'K', 'B', 'F', 'G', 'H', 'N', 'R', 'L'];
/** The model may lowercase these first ones; the rest are restored only in capitals. */
const LOOSE_SLOTS = 8;

/** Weapon and unit names the model mangles; masked like places. */
const TERMS: [RegExp, string][] = [
  // compounds first, so "ударних БпЛА" doesn't become "stroke drones"
  [/ударн[а-яіїєґё]* (?:бпла|дрон[а-яіїєґё]*|безпілотник[а-яіїєґё]*)/gi, 'attack drones'],
  [/шахед[а-яіїєґё]*|shahedw*/gi, 'Shahed drones'],
  [/[іи]скандер[а-яіїєґё]*(?:-[мm])?/gi, 'Iskander-M'],
  [/кал[іи]бр[а-яіїєґё]*/gi, 'Kalibr'],
  [/кинджал[а-яіїєґё]*|кинжал[а-яіїєґё]*/gi, 'Kinzhal'],
  [/геран[а-яіїєґё]*/gi, 'Geran'],
  [/гербер[а-яіїєґё]*/gi, 'Gerbera'],
  [/циркон[а-яіїєґё]*/gi, 'Zircon'],
  [/бпла|бпак|безпілотник[а-яіїєґё]*|беспилотник[а-яіїєґё]*|дрон[а-яіїєґё]*/gi, 'drones'],
  // (JS b only knows ASCII letters, so Cyrillic word edges use lookarounds)
  [/(?<![а-яіїєґё])каб(?![а-яіїєґё])|керован[а-яіїєґё]* авіабомб[а-яіїєґё]*|управляем[а-яіїєґё]* авиабомб[а-яіїєґё]*/gi, 'guided aerial bombs'],
  [/рсзв|рсзо/gi, 'MLRS'],
  [/нептун[а-яіїєґё]*/gi, 'Neptune'],
  [/реактивн[а-яіїєґё]*/gi, 'jet-powered'],
  [/район[а-яіїєґё]* пуску/gi, 'launch areas'],
  [/(?<![а-яіїєґё])обл./gi, 'oblast'],
  [/(?<![а-яіїєґё])рф(?![а-яіїєґё])/gi, 'Russia'],
  // unit names: words the model turns into nonsense ("mope-de-cash crew")
  [/військово-морськ[а-яіїєґё]* сил[а-яіїєґё]*(?: зсу)?/gi, 'Ukrainian Navy'],
  [/(?<![а-яіїєґё])зсу(?![а-яіїєґё])/gi, 'Armed Forces of Ukraine'],
  [/берегов[а-яіїєґё]* ракетн[а-яіїєґё]* комплекс[а-яіїєґё]*/gi, 'coastal missile system'],
  [/мотопіхотн[а-яіїєґё]* бригад[а-яіїєґё]*/gi, 'motorized infantry brigade'],
  [/механізован[а-яіїєґё]* бригад[а-яіїєґё]*/gi, 'mechanized brigade'],
  [/десантно-штурмов[а-яіїєґё]* бригад[а-яіїєґё]*/gi, 'air assault brigade'],
  [/штурмов[а-яіїєґё]* бригад[а-яіїєґё]*/gi, 'assault brigade'],
  [/бригад[а-яіїєґё]* безпілотн[а-яіїєґё]* систем[а-яіїєґё]*/gi, 'unmanned systems brigade'],
  [/окрем[а-яіїєґё]* бригад[а-яіїєґё]*/gi, 'separate brigade'],
  [/імені(?: кошового отамана)?/gi, 'named after'],
  [/повітрян[а-яіїєґё]* тривог[а-яіїєґё]*|тривог[а-яіїєґё]*|воздушн[а-яё]* тревог[а-яё]*|тревог[а-яё]*/gi, 'Air raid alert'],
  [/(?<![а-яіїєґё])зова(?![а-яіїєґё])/gi, 'Zaporizhzhia Regional Military Administration'],
  [/(?<![а-яіїєґё])ова(?![а-яіїєґё])/gi, 'Regional Military Administration'],
  [/(?<![а-яіїєґё])омбр(?![а-яіїєґё])/gi, 'separate mechanized brigade'],
  [/(?<![а-яіїєґё])бпс(?![а-яіїєґё])/gi, 'Unmanned Systems Forces'],
  [/бойов[а-яіїєґё]* розрахун[а-яіїєґё]*/gi, 'combat crew'],
  [/десантник[а-яіїєґё]*/gi, 'paratroopers'],
  [/кор[еи]гувальник[а-яіїєґё]*|корректировщик[а-яё]*/gi, 'fire spotter'],
  [/(?<![а-яіїєґё])сбу(?![а-яіїєґё])/gi, 'SBU'],
  [/(?<![а-яіїєґё])фсб(?![а-яіїєґё])/gi, 'FSB'],
  [/акаунт[а-яіїєґё]* обраниц[а-яіїєґё]*/gi, 'her account'],
  [/обраниц[а-яіїєґё]*/gi, 'girlfriend'],
  [/(?<![а-яіїєґё])акаунт[а-яіїєґё]*|аккаунт[а-яё]*/gi, 'account'],
];

/** Oblasts whose "-щина" name is the whole region ("Харківщина" → Kharkiv Oblast). */
const OBLAST_SHCHYNA: Record<string, string> = {
  Харків: 'Kharkiv', Київ: 'Kyiv', Оде: 'Odesa', Сум: 'Sumy', Полтав: 'Poltava', Херсон: 'Kherson',
  Чернігів: 'Chernihiv', Луган: 'Luhansk', Миколаїв: 'Mykolaiv', Житомир: 'Zhytomyr', Черка: 'Cherkasy',
  Хмельниц: 'Khmelnytskyi', Тернопіль: 'Ternopil', Рівнен: 'Rivne', Волин: 'Volyn', Львів: 'Lviv',
};
/**
 * "-щина" region words: whole oblasts, or the area around a town
 * ("Ізюмщина" → Izium area) — the model turns these into nonsense.
 */
function regionWords(text: string, slot: (value: string) => string | null) {
  // "жителя Ізюмщини" is one noun phrase: masked whole, or the model mangles it
  const re = /(?:(?<![а-яіїєґ])(?:жител|мешкан)[а-яіїєґ]*\s+)?([А-ЯІЇЄҐ][а-яіїєґ'’]+?)щин[а-яіїєґ]*/g;
  return text.replace(re, (m, base: string) => {
    const oblast = OBLAST_SHCHYNA[base];
    const place = oblast ? `${oblast} Oblast` : `${transliterate(base, 'uk')} area`;
    const en = /^[жм]/i.test(m) ? `a resident of the ${place}` : place;
    return slot(en) ?? en;
  });
}

const SECTOR_EN: [RegExp, string][] = [
  [/північно-слобожанськ\S*/i, 'North Slobozhanskyi'],
  [/південно-слобожанськ\S*/i, 'South Slobozhanskyi'],
  [/придніпровськ\S*/i, 'Prydniprovske'],
  [/курськ\S*/i, 'Kursk'],
];

// a capitalised name, including hyphenated ones ("Санкт-Петербург"), up to three words
const NAME_PART = "[А-ЯІЇЄҐЁ][а-яіїєґёыэъ'’ʼ]+(?:-[А-ЯІЇЄҐЁа-яіїєґё][а-яіїєґёыэъ'’ʼ]+)*";
const WORD = new RegExp(`${NAME_PART}(?:\\s+${NAME_PART}){0,2}`, 'g');
const JOINER = /^(\s*,\s*|\s+(?:та|і|й|и)\s+)$/;

/** Mask place names (grouping lists like "Вільне, Світле та Молодецьке" into one slot). */
function mask(text: string, g: Gazetteer, lang: Lang) {
  const values: string[] = [];
  const slot = (value: string) => {
    const existing = values.indexOf(value);
    if (existing >= 0) return SLOTS[existing];
    if (values.length >= SLOTS.length) return null;
    values.push(value);
    return SLOTS[values.length - 1];
  };

  let out = text;
  // front sectors: "на Покровському напрямку" → "на X напрямку"
  // (hyphenated names like "Південно-Слобожанському" are one sector)
  const SECTOR_WORD = "[А-ЯІЇЄҐ][а-яіїєґ'’ʼ]+(?:-[А-ЯІЇЄҐа-яіїєґ][а-яіїєґ'’ʼ]+)*";
  const sectorRe = new RegExp(`(${SECTOR_WORD})(\\s+(?:та|і)\\s+${SECTOR_WORD})?(\\s+напрямк)`, 'g');
  out = out.replace(sectorRe, (m, adj: string, extra: string | undefined, tail: string) => {
    const names = [adj, ...(extra ? [extra.replace(/^\s+(?:та|і)\s+/, '')] : [])].map((a) => sectorName(a, g));
    if (names.some((n) => !n)) return m;
    const s = slot(names.join(' and '));
    return s ? `${s}${tail}` : m;
  });

  // places: find matches, then merge runs separated only by commas / "та" / "і"
  const spans: { start: number; end: number; name: string }[] = [];
  for (const m of out.matchAll(WORD)) {
    const hit = g.find(m[0]).filter((p) => p.kind === 'P');
    if (!hit.length || STOPWORDS.has(m[0].split(/\s+/)[0])) continue;
    // a Ukrainian village near the front beats a namesake in Russia
    const score = (p: (typeof hit)[number]) =>
      (p.country === 'Ukraine' ? 0 : 500) + distanceKm(p, UKRAINE_FRONT) - 40 * Math.log10(p.population + 1);
    const best = [...hit].sort((a, b) => score(a) - score(b))[0];
    spans.push({ start: m.index!, end: m.index! + m[0].length, name: best.name });
  }
  const groups: { start: number; end: number; names: string[] }[] = [];
  for (const s of spans) {
    const last = groups[groups.length - 1];
    if (last && JOINER.test(out.slice(last.end, s.start))) {
      last.end = s.end;
      last.names.push(s.name);
    } else groups.push({ start: s.start, end: s.end, names: [s.name] });
  }
  for (const grp of [...groups].reverse()) {
    const list =
      grp.names.length > 1 ? `${grp.names.slice(0, -1).join(', ')} and ${grp.names[grp.names.length - 1]}` : grp.names[0];
    const s = slot(list);
    if (s) out = out.slice(0, grp.start) + s + out.slice(grp.end);
  }
  out = regionWords(out, slot);
  for (const [re, en] of TERMS) {
    out = out.replace(re, () => slot(en) ?? en);
  }

  // Every other proper name (units, weapons, regions, people) stays a name:
  // written in the Latin alphabet instead of being translated by meaning.
  const names: { start: number; end: number }[] = [];
  for (const m of out.matchAll(PROPER)) {
    const word = m[0];
    const start = m.index!;
    const quoted = /^[«"“]/.test(word);
    const hasDigit = /\d/.test(word);
    if (!quoted && !hasDigit) {
      if (STOPWORDS.has(word.split(/[\s-]/)[0])) continue;
      if (/^[А-ЯІЇЄҐЁ]{2,5}$/.test(word)) continue; // abbreviations (ЗСУ, ППО): leave to the model
      const before = out.slice(0, start).trimEnd();
      if (!before || /[.!?:;]$/.test(before)) continue; // capitalised because it starts a sentence
    }
    names.push({ start, end: start + word.length });
  }
  const runs: { start: number; end: number }[] = [];
  for (const n of names) {
    const last = runs[runs.length - 1];
    if (last && NAME_JOINER.test(out.slice(last.end, n.start))) last.end = n.end;
    else runs.push({ ...n });
  }
  for (const r of [...runs].reverse()) {
    const latin = transliterate(out.slice(r.start, r.end).replace(/\s+(та|і|й|и)\s+/g, ' and '), lang).replace(/[«»"“”]/g, '');
    const s = slot(latin);
    if (s) out = out.slice(0, r.start) + s + out.slice(r.end);
  }
  // Neighbouring placeholders ("Y W Q") get glued together by the model ("YWQ"),
  // so fold each run into its first slot: "motorized infantry brigade named after Kostia Hordiienka".
  const used = SLOTS.slice(0, values.length).join('');
  if (used) {
    const pair = new RegExp(`(?<![A-Za-z])([${used}])([\\s«»"“”]*)([${used}])(?![A-Za-z])`);
    for (let m = out.match(pair); m; m = out.match(pair)) {
      const a = SLOTS.indexOf(m[1]);
      const b = SLOTS.indexOf(m[3]);
      if (a === b) break;
      values[a] = `${values[a].trimEnd()} ${values[b].trimStart()}`;
      out = out.slice(0, m.index!) + m[1] + out.slice(m.index! + m[0].length);
    }
  }
  return { masked: out, values };
}

/** A capitalised Cyrillic word (with hyphenated / numbered parts), a code like С-400, or a quoted name. */
const PROPER =
  // whole words only — a lone capital letter is never a name (it would split "ЗОВА" letter by letter)
  // quoted text is a name only when it starts with a capital («Накипіло», not «обраниці»)
  /[«"“][А-ЯІЇЄҐЁA-Z0-9][^»"”\n]{1,39}[»"”]|[А-ЯІЇЄҐЁ](?:[а-яіїєґёыэъ'’ʼ]+|[А-ЯІЇЄҐЁ]+)(?:-[А-ЯІЇЄҐЁа-яіїєґёыэъA-Z0-9]+)*/g;
const NAME_JOINER = /^(\s*[,/]\s*|\s+|\s+(?:та|і|й|и)\s+|\s*[–—-]\s*)$/;



function sectorName(adj: string, g: Gazetteer): string | null {
  for (const [re, en] of SECTOR_EN) if (re.test(adj)) return en;
  return resolveFrontTown(adj, g, UKRAINE_FRONT)?.name ?? null;
}

const STOPWORDS = new Set(
  'Сил Сили Силами Сила Україна України Україні Україну Слава Перемогу Перемога Збройних Генерального Штаб ЗСУ Росія Росії Оборони Ворог Противник Загалом Також Крім Протягом Учора Вчора Сьогодні Дякуємо Лише'.split(' '),
);

/**
 * Report phrasing the small model misreads ("доби" → "era", "окупанти" →
 * "merchants", "населеного пункту" → "population point"): rewritten into
 * plainer Ukrainian/Russian before translation, then tidied in English after.
 */
const PRE: [RegExp, string][] = [
  // quotes around ordinary words («обраниці») make the model drop them
  [/«([а-яіїєґё][^»\n]{0,30})»/g, '$1'],
  // Arabic casualty phrasing the model reads as names ("Shihadan and Mozab")
  [/شهيدان/g, 'استشهاد شخصين'],
  [/(\d+) شهداء/g, 'استشهاد $1 أشخاص'],
  [/ومصابون|ومصابين/g, 'وإصابة آخرين'],
  [/(у|в) районах? населен\S+ пункт\S*/gi, 'біля'],
  [/неподалік населен\S+ пункт\S*/gi, 'біля'],
  [/(в|у) бік населен\S+ пункт\S*/gi, 'в бік'],
  [/населен\S+ пункт\S*/gi, ''],
  [/від початку доби/gi, 'з початку дня'],
  [/минулої доби/gi, 'вчора'],
  [/(\d+)-(ша|га|тя|ма) доба/gi, '$1-й день'],
  [/доби/gi, 'дня'],
  [/окупант\S*|загарбник\S*|противник\S*/gi, 'ворог'],
  [/Окупант\S*|Загарбник\S*|Противник\S*/g, 'Ворог'],
  [/штурмов\S* ді\S*/gi, 'штурми'],
  [/боєзіткнен\S*|бойов\S* зіткнен\S*/gi, 'бої'],
  [/в районе населенн\S+ пункт\S*/gi, 'возле'],
];

const POST: [RegExp, string][] = [
  [/\b(?:the|a) (her|his|their|the|a)\b/gi, '$1'],
  // contractions: transliteration afterwards drops the apostrophe ("He's" → "Hes")
  [/\b(He|She|It)['’]?s\b/g, '$1 is'],
  [/\b(I|you|we|they)['’]re\b/gi, '$1 are'],
  [/\bwas (?:in|leading|led by) Russian special (?:forces|services)\b/g, 'was run by Russian special services'],
  [/\b(SBU|police|FSB) (kept|was delaying|delayed|held|was holding|was keeping)\b/g, '$1 detained'],
  // Ukrainian drops the pronoun ("Шукав…, а став…"): the model fills in "I"
  [/\bI was looking for\b/g, 'He was looking for'],
  [/\b(?:I was becoming|I was set to|He became|was becoming|became) (?:a )?fire spotter\b/g, 'became a fire spotter'],
  [/\bOblast drones\b/g, 'Oblast with drones'],
  [/-(direction|axis)\b/gi, ' $1'],
  [/\b(\w+) side\b/g, '$1 direction'],
  [/\bstorm attacks?\b/gi, 'assault'],
  [/\bopponent\b/gi, 'enemy'],
  [/\s+([,.])/g, '$1'],
  [/\s{2,}/g, ' '],
];

/** "ТРИВОГА В ЗАПОРІЖЖІ" → "Air raid alert in Zaporizhzhia"; "Відбій тривоги" → "All clear". */
function translateAlert(s: string, g: Gazetteer, lang: Lang): string | null {
  const text = s.replace(/[!.]+$/, '').trim();
  if (/^(відбій|отбой)( повітряної)? (тривоги|тревоги)/i.test(text)) {
    const where = text.match(/\s(?:в|у|по)\s+(.+)$/i)?.[1];
    return `All clear${where ? ` in ${placeName(where, g, lang)}` : ''}`;
  }
  const m = text.match(/^(?:повітряна\s+|воздушная\s+)?(?:тривога|тревога)(?:\s+(?:в|у|по)\s+(.+))?$/i);
  if (!m) return null;
  return `Air raid alert${m[1] ? ` in ${placeName(m[1], g, lang)}` : ''}`;
}

function placeName(raw: string, g: Gazetteer, lang: Lang) {
  const words = raw.trim();
  if (/^(област|области|області)/i.test(words)) return 'the oblast';
  if (/^(місті|городе|місто)/i.test(words)) return 'the city';
  const cap = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  const hit = g.find(cap).filter((p) => p.kind === 'P').sort((a, b) => b.population - a.population)[0];
  return hit?.name ?? transliterate(cap, lang);
}

/**
 * Arabic has no capitals, so names are found by trying every 1–3 word run against
 * the gazetteer; matches become placeholders carrying the English place name
 * ("حي الشيخ رضوان" → "Ash Shaykh Radwan" rather than a literal translation).
 */
function maskArabic(text: string, g: Gazetteer) {
  const values: string[] = [];
  const tokens = [...text.matchAll(/[\u0600-\u06FF]+/g)];
  const spans: { start: number; end: number; name: string }[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let len = Math.min(3, tokens.length - i); len >= 1; len--) {
      const run = tokens.slice(i, i + len);
      // only words separated by single spaces form a name
      if (run.some((t, k) => k > 0 && text.slice(run[k - 1].index! + run[k - 1][0].length, t.index!) !== ' ')) continue;
      const phrase = run.map((t) => t[0]).join(' ');
      if (len === 1 && (ARABIC_STOP.has(phrase) || phrase.length < 3)) break;
      const hits = g
        .find(phrase)
        .filter((p) => p.kind === 'P' && (len > 1 || p.population >= 1000 || p.country === 'Israel' || p.country === 'Palestine'));
      if (hits.length) {
        const best = [...hits].sort((a, b) => b.population - a.population)[0];
        spans.push({ start: run[0].index!, end: run[len - 1].index! + run[len - 1][0].length, name: best.name });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  let out = text;
  for (const sp of spans.reverse()) {
    if (values.length >= SLOTS.length) break;
    values.push(sp.name);
    out = out.slice(0, sp.start) + SLOTS[values.length - 1] + out.slice(sp.end);
  }
  return { masked: out, values };
}

/** Common words that are also hamlet names somewhere (and the outlets' own names). */
const ARABIC_STOP = new Set(
  'الله الاحتلال العدو شهيد شهيدان شهداء الشهداء جرحى مصابين مصابون المسيرة عاجل مراسلنا مدينة بمدينة الجيش قوات مصادر اليوم منطقة بلدة مخيم حي'.split(' '),
);

/** Emoji (❗️💥🤬) confuse the model; the original text keeps them. */
function stripEmoji(s: string) {
  return s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

/** "ТРИВОГА В ЗАПОРІЖЖІ" → "Тривога в запоріжжі": shouting text reads as names letter by letter otherwise. */
function normalizeCase(s: string, g: Gazetteer) {
  const letters = s.match(/\p{L}/gu) ?? [];
  const upper = letters.filter((c) => c !== c.toLowerCase()).length;
  if (letters.length < 6 || upper / letters.length < 0.6) return s;
  // lowercase, then give known towns their capital back so they're still recognised as places
  const lower = s.toLowerCase().replace(/[а-яіїєґё'’ʼ-]{4,}/g, (w) => {
    const cap = w.charAt(0).toUpperCase() + w.slice(1);
    return g.find(cap).some((p) => p.kind === 'P' && p.population >= 1000) ? cap : w;
  });
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Single capital letters standing alone — leftover placeholders. */
const STRAY = /(?<![A-Za-z'’.])[XYZWQVJKBFGHNRL](?![A-Za-z0-9.-])\s?/g;

/** How garbled a translation looks: stray letters and stuttering repetition. */
function noise(text: string) {
  const stray = text.match(STRAY)?.length ?? 0;
  const stutter = text.match(/\b(\w{1,3})(?:[-\s]\1\b){2,}/g)?.length ?? 0;
  const letterChains = text.match(/\b[A-Z](?:-[A-Z]){2,}\b/g)?.length ?? 0;
  return stray + 3 * stutter + 3 * letterChains;
}

/** Every masked name made it back, and no stray placeholder letter is left. */
function placeholdersSurvived(english: string, values: string[]) {
  const lower = english.toLowerCase();
  const allBack = values.every((v) => lower.includes(v.split(/[\s,/]/)[0].toLowerCase()));
  const stray = new RegExp(`(?<![A-Za-z'’])[${SLOTS.slice(0, Math.max(1, values.length)).join('')}](?![A-Za-z0-9-])`).test(english);
  return allBack && !stray;
}

function unmask(text: string, values: string[]) {
  let out = text;
  values.forEach((v, i) => {
    // the model sometimes lowercases a placeholder or inflects it ("Ys", "X's")
    // (an apostrophe before it means it's part of "enemy's", not a placeholder)
    out = out.replace(new RegExp(`(?<![A-Za-z'’])${SLOTS[i]}(?:'s|s)?(?![A-Za-z])`, i < LOOSE_SLOTS ? 'gi' : 'g'), v);
  });
  return out;
}

function createLocalTranslator(cacheDir: string): Translator {
  const pipes = new Map<Lang, Promise<Pipe>>();
  const load = (lang: Lang) => {
    let p = pipes.get(lang);
    if (!p) {
      p = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.cacheDir = cacheDir;
        return (await pipeline('translation', `Xenova/opus-mt-${lang}-en`, { dtype: 'q8' })) as unknown as Pipe;
      })();
      pipes.set(lang, p);
    }
    return p;
  };
  return {
    engine: 'local',
    async translate(text, lang, g) {
      const pipe = await load(lang);
      const out: string[] = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) {
          out.push('');
          continue;
        }
        // sentence by sentence keeps inputs well inside the model's limits
        const sentences = line.match(/[^.!?]+[.!?]*\s*/g) ?? [line];
        const parts: string[] = [];
        for (const s of sentences) {
          if (!/[а-яіїєґё؀-ۿ]/i.test(s)) {
            parts.push(s.trim());
            continue;
          }
          // Alert one-liners are too short for the model (it invents whole sentences):
          // they follow a fixed pattern, so translate them directly.
          const alert = translateAlert(stripEmoji(s.trim()), g, lang);
          if (alert) {
            parts.push(alert);
            continue;
          }
          const plain = PRE.reduce((t, [re, rep]) => t.replace(re, rep), normalizeCase(stripEmoji(s.trim()), g));
          const { masked, values } = lang === 'ar' ? maskArabic(plain, g) : mask(plain, g, lang);
          const [res] = await pipe(masked, { max_new_tokens: 400 });
          let english = unmask(res.translation_text, values);
          // If the model dropped or garbled a placeholder, retry with the Latin
          // names written straight into the sentence instead.
          if (!placeholdersSurvived(english, values)) {
            const inline = values.reduce(
              (t, v, i) => t.replace(new RegExp(`(?<![A-Za-z])${SLOTS[i]}(?![A-Za-z])`, 'g'), v),
              masked,
            );
            const [retry] = await pipe(inline, { max_new_tokens: 400 });
            // keep whichever reads cleaner; on very dense sentences the retry can be worse
            if (noise(retry.translation_text) <= noise(english)) english = retry.translation_text;
            english = english.replace(STRAY, '').replace(/\s{2,}/g, ' ');
          }
          // anything the model left in Cyrillic still ends up in the Latin alphabet
          const tidied = stripEmoji(decodeEntities(POST.reduce((t, [re, rep]) => t.replace(re, rep), english)));
          parts.push(transliterate(tidied, lang));
        }
        out.push(parts.join(' '));
      }
      return out.join('\n').trim();
    },
  };
}

// ── Cached front door ────────────────────────────────────────────────────────
export interface TranslationService {
  readonly engine: Engine | 'off';
  /** Cached translation, or null if not translated yet. */
  get(text: string): string | null;
  /** Translate (once) and cache. */
  ensure(text: string, lang: Lang, g: Gazetteer): Promise<string | null>;
}

export async function createTranslationService(opts: {
  cacheFile: string;
  modelDir: string;
  log: (m: string) => void;
}): Promise<TranslationService> {
  const setting = (process.env.TRANSLATE_ENGINE ?? 'auto').toLowerCase();
  if (setting === 'off') return { engine: 'off', get: () => null, ensure: async () => null };

  const useClaude = setting === 'claude' || (setting === 'auto' && !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN));
  const primary = useClaude ? createClaudeTranslator() : createLocalTranslator(opts.modelDir);
  // if Claude fails (no credit, network), fall back to the local model for that text
  const backup = useClaude ? createLocalTranslator(opts.modelDir) : null;
  opts.log(`translation engine: ${primary.engine}`);

  // Bump when the translators change so older cached output is redone.
  const version = `${primary.engine}-${primary.engine === 'claude' ? CLAUDE_VERSION : LOCAL_VERSION}`;
  const key = (text: string) => createHash('sha1').update(version).update(text).digest('hex').slice(0, 16);
  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse(await readFile(opts.cacheFile, 'utf8')) as Record<string, string>;
  } catch {
    /* first run */
  }
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await mkdir(dirname(opts.cacheFile), { recursive: true });
        await writeFile(`${opts.cacheFile}.tmp`, JSON.stringify(cache));
        await rename(`${opts.cacheFile}.tmp`, opts.cacheFile);
      } catch (e) {
        opts.log(`translation cache write failed: ${(e as Error).message}`);
      }
    }, 2_000);
  };

  // one translation at a time — the local model is CPU-bound
  let queue: Promise<unknown> = Promise.resolve();
  return {
    engine: primary.engine,
    get: (text) => cache[key(text)] ?? null,
    ensure(text, lang, g) {
      const k = key(text);
      if (cache[k]) return Promise.resolve(cache[k]);
      const job = queue.then(async () => {
        if (cache[k]) return cache[k];
        let out: string;
        try {
          out = await primary.translate(text, lang, g);
        } catch (e) {
          if (!backup) throw e;
          opts.log(`claude translation failed (${(e as Error).message}); using local model`);
          out = await backup.translate(text, lang, g);
        }
        cache[k] = out;
        save();
        return out;
      });
      queue = job.catch(() => undefined);
      return job.catch((e) => {
        opts.log(`translation failed: ${(e as Error).message}`);
        return null;
      });
    },
  };
}
