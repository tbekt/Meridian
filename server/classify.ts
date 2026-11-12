/**
 * Headline → category. GDELT's machine-coded themes are too noisy on their own
 * (sports, crime and history stories routinely get "military" tags), so the
 * article's own headline decides whether it is a conflict event and of what kind.
 * Rules run in order; the first match wins, most specific first.
 */
import type { CategoryId } from '../src/types.ts';

interface Rule {
  category: CategoryId;
  test: RegExp;
  /** Ambiguous words: only count when the headline also has conflict context. */
  needsContext?: boolean;
}

const RULES: Rule[] = [
  { category: 'drone', test: /\b(drones?|uavs?|shaheds?|kamikaze|loitering munitions?)\b/i },
  {
    category: 'airdefense',
    test: /\b(air[- ]defen[cs]es?|intercept(ed|s|ion|ions|ors?)|shot down|downs? (a |an )?(jet|plane|aircraft|missile)|air[- ]raid (alert|sirens?)|sirens? (sound|wail))/i,
  },
  {
    category: 'missile',
    test: /\b(missiles?|ballistic|hypersonic|rocket (attack|fire|strike|barrage)s?|rockets? (fired|launched|hit|struck)|barrage of rockets)\b/i,
  },
  {
    category: 'airstrike',
    test: /\b(air ?strikes?|air raids?|warplanes?|bombing (raid|campaign)s?|bombard(s|ed|ment)|bombs? (dropped|hit|struck)|fighter jets? (strike|struck|hit|bomb))/i,
  },
  { category: 'shelling', test: /\b(shell(s|ed|ing)|artillery|mortars?|howitzers?|mlrs)\b/i },
  {
    category: 'explosion',
    test: /\b(explosions?|explosives?|blast\b|blasts (hit|rock|heard|reported|kill|struck)|explod(e|es|ed|ing)|ieds?|car bomb(s|ing)?|suicide (bomb|bomber|attack)s?|landmines?|grenades?)\b/i,
    needsContext: true,
  },
  {
    category: 'naval',
    test: /\b(navy|naval|warships?|frigates?|destroyers?|aircraft carriers?|submarines?|coast ?guard|blockade|strait of hormuz|red sea|black sea fleet|tankers? (seized|attacked|hit|struck)|ships? (attacked|hit|struck|seized))\b/i,
    needsContext: true,
  },
  {
    category: 'infrastructure',
    test: /\b(power (outages?|cuts?|grid|plant|station)|blackouts?|energy (infrastructure|facilit(y|ies)|grid)|substations?|refiner(y|ies)|gas field|oil field|pipeline|bridge (destroyed|struck|hit|attacked)|dam (breach|destroyed|struck))/i,
    needsContext: true,
  },
  {
    category: 'movement',
    test: /\b(troops? (deploy|deployed|deployment|mass|massing|build-?up|move|moving|withdraw|withdrawal|arrive)|deploy(s|ed|ing)? .{0,30}troops|military (convoy|build-?up|drills?|exercises?|deployment)|mobili[sz](e|es|ed|ation)|reinforcements)\b/i,
  },
  {
    category: 'clashes',
    test: /\b(firefights?|gun ?battles?|militants?|insurgents?|jihadists?|militias?|paramilitar(y|ies)|ambush(ed)?|front ?lines?|troops (attack|advance|captured?|seized?)|captures? (village|town|city)|seiz(e|es|ed) (village|town|city)|gunmen|insurgency|guerrillas?|armed groups?|hostages?)\b/i,
  },
  { category: 'clashes', test: /\b(clash(es|ed)?|fighting|offensive|counter-?offensive|rebels?)\b/i, needsContext: true },
  {
    category: 'humanitarian',
    test: /\b(humanitarian|aid (convoy|trucks?|deliver(y|ies)|workers?|agenc(y|ies))|refugees?|evacuat(e|es|ed|ion|ions)|displaced|famine|starvation|civilian casualties|unicef|unhcr|wfp|red cross|red crescent)\b/i,
    needsContext: true,
  },
  {
    category: 'protest',
    test: /\b(protest(s|ers|ed|ing)?|demonstrat(ion|ions|ors)|rall(y|ies) against|riots? (police|erupt|break out|in)|rioters|march(es)? against|unrest|crackdown on (protest|dissent|opposition|demonstrat))/i,
  },
];

/** Political/diplomatic items only qualify when they're about armed conflict. */
const POLITICS =
  /\b(ceasefire|cease-fire|truce|peace (talks|deal|plan|process|agreement)|armistice|sanctions?|negotiat(e|es|ions|ors)|talks|summit|diplomat(s|ic)?|envoy|security council|nato)\b/i;

const CONFLICT_CONTEXT =
  /\b(war|wartime|military|army|armed forces|troops|soldiers|attack(s|ed)?|strikes?|struck|killed|kills|casualties|invasion|invade[sd]?|occupied|occupation|annex|nuclear|defen[cs]e (minister|ministry)|hezbollah|hamas|houthis?|idf|rsf|taliban|al-shabaab|isis|islamic state|boko haram|wagner|pentagon|kremlin|insurgen\w*|militants?|terror(ism|ist)?s?|protesters|riot police|ukraine|russia|gaza|israel|iran|sudan|yemen|syria|lebanon)\b/i;

/** Out-of-scope stories that still trip the patterns above. */
const EXCLUDE = new RegExp(
  [
    // sport
    'nfl|nba|mlb|nhl|ncaa|premier league|champions league|nations (league|championship)|world cup|super bowl|playoffs?|quarterback|touchdown|coordinator|head coach|week \\d+|bowl\\b|rivalry|derby|fixtures?|semi-?finals?|usmnt|uswnt|squad|studs|duds|predictions|beats|wins over|win over|win against|loss to|cricket|rugby|tennis|golf|grand prix|transfer window|pickleball',
    // culture & commerce
    'season \\d|episode|trailer|box office|netflix|movie|film|album|novel|book review|exhibition|documentary|concert|video ?game|esports|fortnite|recipe|horoscope|earnings|crypto|bitcoin|fashion|celebrity|wedding|obituary|black friday|halloween',
    // history & commemoration
    'remembrance|armistice day|veterans day|memorial day|world war (one|two|i|ii|1|2)|great war|civil war|war dead|war memorial|anniversary|centenary|history|letters from|poppy|re-?enactment',
    // idioms
    'riot act|war on (drugs|christmas|woke|inflation)|price war|culture war|bidding war|holy war|war of words|turf war|trade war|fighting (city hall|chance|fit|spirit|cancer|crime|fraud|inflation)',
  ]
    .map((g) => `\\b(${g})`)
    .join('|'),
  'i',
);

/** Everyday-crime and policing stories that use conflict words. */
const CRIME =
  /\b(robbery|robbed|burglar(y|ies)|carjack\w*|shoplift\w*|domestic|road rage|drunk|dui|sentenced|pleads? guilty|court hears|jury|trial|lawsuit|stabbing|stabbed|fraud|traffic stops?|deportation|ice raids?)\b/i;

/** Ukrainian / Russian vocabulary for channel posts (stems, so inflections match). */
const SLAVIC_RULES: Rule[] = [
  { category: 'drone', test: /(бпла|безпілот|беспилот|дрон|шахед|shahed|герани|герань|ланцет)/i },
  { category: 'airdefense', test: /(збито|подавлено|сбит|ппо\b|протиповітрян|противовоздуш|тривог|тревог)/i },
  { category: 'missile', test: /(ракет|іскандер|искандер|калібр|калибр|кинджал|кинжал|х-101|x-101)/i },
  { category: 'airstrike', test: /(авіаудар|авиаудар|авіаційн\S* удар|авиационн\S* удар|кероване?\S* авіабомб|кераб|\bкаб\b|авіабомб|авиабомб)/i },
  { category: 'shelling', test: /(обстріл|обстрел|артилер|артиллер|рсзв|рсзо|мінометн|миномет)/i },
  { category: 'explosion', test: /(вибух|взрыв|прил[еёі]т|пожеж|пожар|горит|горять|горят|горіл|загорян|возгоран|влучан|попадан)/i },
  { category: 'clashes', test: /(бойов\S* зіткнен|боестолкнов|штурм|наступ|атак|бо[йї] трива|\bбои\b|просунут)/i },
  { category: 'infrastructure', test: /(енергетик|енергооб|знеструм|блекаут|енергетичн|электроснабж|подстанц|підстанц)/i },
  { category: 'humanitarian', test: /(евакуац|эвакуац|гуманітар|гуманитар|поранен|ранен|загибл|погиб)/i },
];

/**
 * Posts from conflict-monitoring channels are in scope by definition, so this
 * skips the news filters and only decides the category. English posts use the
 * headline rules; Ukrainian and Russian ones the Slavic vocabulary.
 */
/** War-related vocabulary for channel posts that matched no specific category. */
const REPORT_CONTEXT =
  /(війн|войн|фронт|ворог|противник|окупант|оккупант|загарбник|рф|росі[яйї]|россия|зсу|всу|полон|обмін|обмен|перемовин|переговор|санкці|санкци|мобіліз|мобилиз|загибл|погиб|поранен|ранен|удар|атак|обстр|вибух|взрыв|тривог|тревог|укритт|укрыт|\b(war|front ?line|troops|military|army|ceasefire|sanctions|prisoner|occupied|invasion|killed|wounded)\b)/i;

/** Arabic vocabulary (news agencies, Al Jazeera, Al-Masirah style). */
const ARABIC_RULES: Rule[] = [
  // (not "المسيرة" with the article: that's also the name of Al-Masirah TV)
  { category: 'drone', test: /((?<!ال)مسي?ّ?ر[هة]|مسيرات|طائر[هة] مسير|درون)/ },
  { category: 'airdefense', test: /(اعتراض|صفارات الإنذار|صفارات الانذار|القبة الحديدية|الدفاعات الجوية|الدفاع الجوي|إنذار|انذار)/ },
  { category: 'missile', test: /(صاروخ|صواريخ|باليستي|فرط صوتي|قذائف صاروخية)/ },
  { category: 'airstrike', test: /(غار[هة]|غارات|قصف جوي|طيران حربي|الطيران الحربي|مقاتلات|حزام ناري)/ },
  { category: 'shelling', test: /(قصف مدفعي|قذائف|مدفعي|هاون|قصف)/ },
  { category: 'explosion', test: /(انفجار|انفجارات|تفجير|عبو[ةه] ناسف|حريق|اشتعال)/ },
  { category: 'naval', test: /(سفين[ةه]|سفن|بحري[ةه]|زوارق|البحر الأحمر|ميناء|ناقل[ةه])/ },
  { category: 'clashes', test: /(اشتباك|اشتباكات|اقتحام|اقتحم|توغل|كمين|قنص|معارك|مواجهات|عملي[ةه] عسكري)/ },
  { category: 'humanitarian', test: /(شهيد|شهداء|استشهاد|إصاب|اصاب|جرحى|ضحايا|نزوح|نازحين|مساعدات|إغاث|اغاث|مجاع|مستشفى|إخلاء|اخلاء)/ },
  { category: 'protest', test: /(مظاهر[ةه]|مظاهرات|احتجاج|وقف[ةه] احتجاجي)/ },
  { category: 'politics', test: /(وقف إطلاق النار|وقف اطلاق النار|هدن[ةه]|مفاوضات|اتفاق|صفق[ةه]|مجلس الأمن)/ },
];

export function classifyReport(text: string): CategoryId | null {
  const arabic = (text.match(/[؀-ۿ]/g)?.length ?? 0) > text.length / 3;
  if (arabic) {
    for (const r of ARABIC_RULES) if (r.test.test(text)) return r.category;
    return null; // nothing war-related recognised
  }
  const cyrillic = (text.match(/[а-яіїєґ]/gi)?.length ?? 0) > text.length / 3;
  for (const r of cyrillic ? [...SLAVIC_RULES, ...RULES] : [...RULES, ...SLAVIC_RULES]) {
    if (r.test.test(text)) return r.category;
  }
  if (/\b(attack|strike|assault)/i.test(text)) return 'clashes';
  // nothing war-related: local news channels also post weather, appointments, appeals
  return REPORT_CONTEXT.test(text) ? 'politics' : null;
}

export function classify(title: string): CategoryId | null {
  if (title.length < 18 || title === title.toUpperCase() || EXCLUDE.test(title) || CRIME.test(title)) return null;
  const context = CONFLICT_CONTEXT.test(title);
  for (const r of RULES) {
    if (!r.test.test(title)) continue;
    if (r.needsContext && !context) continue;
    return r.category;
  }
  if (POLITICS.test(title) && context) return 'politics';
  if (/\b(war|invasion|military operation)\b/i.test(title) && context) return 'politics';
  return null;
}

/** Tidy a page title: decode entities, drop " | Site Name" style suffixes. */
export function cleanTitle(raw: string, domain: string): string {
  let t = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  // "Headline | Site" or "Site | Headline": keep the longest segment
  const pipe = t.split(' | ');
  if (pipe.length > 1) t = pipe.reduce((a, b) => (b.length > a.length ? b : a));
  // "Headline - Site" / "Headline * Site * by Author": drop when the suffix looks like an outlet
  t = t.replace(/\s+\*\s+.*$/, '');
  const stem = domain.replace(/^www\./, '').split('.')[0].toLowerCase();
  const dash = t.match(/^(.*\S)\s+[-–—]\s+([^-–—]{2,40})$/);
  if (dash && dash[1].length > 20) {
    const suffix = dash[2].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      suffix.includes(stem.slice(0, 5)) ||
      stem.includes(suffix.slice(0, 5)) ||
      /news|times|post|daily|tv|radio|herald|tribune|journal|press|online|chronicle|gazette|sun\b/.test(dash[2].toLowerCase())
    ) {
      t = dash[1];
    }
  }
  return t.replace(/^["“]|["”]$/g, '').trim();
}

const NAMED: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', hellip: '…',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
