/**
 * Offline place-name lookup built from GeoNames (geonames.org, CC BY 4.0).
 *
 * Downloaded once into .cache/geonames and indexed in memory:
 *  - UA, IL, PS, LB, SY: every populated place in Ukraine, Israel, Palestine, Lebanon and Syria
 *  - cities500.zip: towns of 500+ people, filtered to neighbouring countries
 *    (Russia, Belarus, Moldova; Lebanon, Syria, Jordan, Egypt and the wider Middle East)
 *  - admin1CodesASCII.txt: oblast / region names for display
 *
 * Names are matched on a transliteration "skeleton" so that the many English
 * spellings of the same village (Kostyantynivka / Kostiantynivka,
 * Novyy / Novyi Donbas) land on the same key. Cyrillic, Arabic and Hebrew
 * names are indexed too.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { transliterate } from './translit.ts';

export interface Place {
  name: string;
  lat: number;
  lng: number;
  population: number;
  country: string;
  admin?: string;
  /** GeoNames feature class: P = populated place, A = administrative area */
  kind: 'P' | 'A';
  /** name keys of the official / ASCII name (alternates excluded) */
  primary: string[];
}

const BASE = 'https://download.geonames.org/export/dump';
/** Every populated place, however small. */
const FULL = ['UA', 'IL', 'PS', 'LB', 'SY'];
/** Towns of 500+ people. */
const NEIGHBOURS = new Set(['RU', 'BY', 'MD', 'LB', 'SY', 'JO', 'EG', 'YE', 'IQ', 'IR', 'SA']);
const COUNTRY_NAMES: Record<string, string> = {
  UA: 'Ukraine', RU: 'Russia', BY: 'Belarus', MD: 'Moldova', IL: 'Israel', PS: 'Palestine', LB: 'Lebanon',
  SY: 'Syria', JO: 'Jordan', EG: 'Egypt', YE: 'Yemen', IQ: 'Iraq', IR: 'Iran', SA: 'Saudi Arabia',
};

const ARABIC = /[\u0600-\u06FF]/;
const HEBREW = /[\u0590-\u05FF]/;

/** Lowercase transliteration skeleton shared by Latin and Cyrillic spellings. */
export function nameKey(s: string): string {
  if (ARABIC.test(s)) {
    // drop vowel marks and tatweel, unify alef / ta marbuta / alef maqsura, drop the article "ال"
    return s
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[\s-]+/g, ' ')
      .trim()
      .split(' ')
      .map((w) => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w))
      .join(' ');
  }
  if (HEBREW.test(s)) return s.replace(/[\u0591-\u05C7]/g, '').replace(/[\s-]+/g, ' ').trim();
  let k = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'ʼ`"]/g, '')
    .replace(/[\s-]+/g, ' ')
    .trim();
  if (/[a-z]/.test(k)) {
    k = k
      .replace(/[yj]/g, 'i')
      .replace(/i{2,}/g, 'i')
      .replace(/([a-z])\1+/g, '$1')
      // soft vowels: Vasyutynske / Vasutynske, Dobropillya / Dobropila
      .replace(/i([aueo])/g, '$1');
  } else {
    k = k.replace(/[ії]/g, 'и').replace(/є/g, 'е').replace(/ґ/g, 'г').replace(/й/g, 'и').replace(/ь/g, '');
  }
  return k;
}

export class Gazetteer {
  private index = new Map<string, Place[]>();

  get size() {
    return this.index.size;
  }

  add(key: string, p: Place) {
    if (key.length < 3) return;
    const list = this.index.get(key);
    if (!list) this.index.set(key, [p]);
    else if (!list.includes(p)) list.push(p);
  }

  lookup(name: string): Place[] {
    return this.index.get(nameKey(name)) ?? [];
  }

  /**
   * Places whose *official* name matches — not ones that merely list it as a
   * historic or foreign alternate (Zaporizhzhia was once "Oleksandrivsk";
   * a Russian "Svetloye" lists "Світле"). Cyrillic input is compared through
   * its Latin transliteration, since GeoNames' official names are Latin.
   */
  findPrimary(name: string): Place[] {
    const { hits, form } = this.lookupForm(name);
    const key = nameKey(/[а-яіїєґё]/i.test(form) ? transliterate(form, 'uk') : form);
    return hits.filter((p) => p.primary.includes(key));
  }

  /** Official-name matches when there are any, otherwise every match. */
  find(name: string): Place[] {
    const primary = this.findPrimary(name);
    return primary.length ? primary : this.lookupInflected(name);
  }

  /** Ukrainian/Russian names are inflected ("у Харкові", "біля Вільного"): try stems too. */
  lookupInflected(word: string): Place[] {
    return this.lookupForm(word).hits;
  }

  /** Matches plus the (de-inflected) form that produced them. */
  private lookupForm(word: string): { hits: Place[]; form: string } {
    const direct = this.lookup(word);
    if (direct.length) return { hits: direct, form: word };
    if (ARABIC.test(word)) {
      // attached prepositions/conjunctions: "بغزة" (in Gaza), "والقدس" (and Jerusalem), "لرفح"
      for (const prefix of ['و', 'ف', 'ب', 'ل', 'ك', 'وب', 'ول', 'فب', 'فل', 'وال', 'بال', 'لل']) {
        if (word.length <= prefix.length + 2 || !word.startsWith(prefix)) continue;
        const form = word.slice(prefix.length);
        const hits = this.lookup(form);
        if (hits.length) return { hits, form };
      }
      return { hits: [], form: word };
    }
    if (!/[а-яіїєґ]/i.test(word)) return { hits: direct, form: word };
    const swaps: [RegExp, string][] = [
      [/ого$/, 'е'], [/ого$/, 'ий'], [/ому$/, 'е'], [/ому$/, 'ий'], [/ої$/, 'а'], [/ій$/, 'а'],
      [/ці$/, 'ка'], [/ки$/, 'ка'], [/ові$/, ''], [/еві$/, ''], [/і$/, ''], [/у$/, ''], [/а$/, ''],
      [/ом$/, ''], [/ем$/, 'е'], [/ах$/, 'и'], [/і$/, 'а'], [/і$/, 'я'], [/ю$/, 'я'], [/ях$/, 'і'],
    ];
    for (const [re, rep] of swaps) {
      if (!re.test(word)) continue;
      const form = word.replace(re, rep);
      const hits = this.lookup(form);
      if (hits.length) return { hits, form };
    }
    return { hits: [], form: word };
  }
}

async function download(url: string, file: string) {
  try {
    await stat(file);
    return; // cached
  } catch {
    /* fetch below */
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'Meridian/0.1 (live event map)' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  // write to a temporary file first, so a half-written download is never read as the real one
  await writeFile(`${file}.part`, Buffer.from(await res.arrayBuffer()));
  await rename(`${file}.part`, file);
}

function* rows(zipBytes: Uint8Array) {
  const files = unzipSync(zipBytes);
  for (const [name, data] of Object.entries(files)) {
    if (!name.endsWith('.txt') || name.startsWith('readme')) continue;
    for (const line of strFromU8(data).split('\n')) if (line) yield line.split('\t');
  }
}

/** Download (first run only) and index GeoNames. Takes a few seconds. */
export async function loadGazetteer(dir: string, log: (m: string) => void): Promise<Gazetteer> {
  await mkdir(dir, { recursive: true });
  const files = {
    cities: join(dir, 'cities500.zip'),
    admin: join(dir, 'admin1CodesASCII.txt'),
  };
  await Promise.all([
    ...FULL.map((c) => download(`${BASE}/${c}.zip`, join(dir, `${c}.zip`))),
    download(`${BASE}/cities500.zip`, files.cities),
    download(`${BASE}/admin1CodesASCII.txt`, files.admin),
  ]);

  const adminNames = new Map<string, string>();
  for (const line of (await readFile(files.admin, 'utf8')).split('\n')) {
    const [code, name] = line.split('\t');
    if (code && name) adminNames.set(code, name.replace(/ Oblast$/, '').replace(/^Misto /, ''));
  }

  const g = new Gazetteer();
  const ingest = (f: string[]) => {
    // geonameid, name, asciiname, alternatenames, lat, lng, class, code, country, cc2, admin1, …, population
    const cls = f[6];
    const code = f[7];
    if (cls !== 'P' && !(cls === 'A' && code === 'ADM1')) return;
    const country = f[8];
    const p: Place = {
      // the ASCII form reads better on a map (Khan Yunis rather than Khān Yūnis)
      name: f[2] || f[1],
      lat: +f[4],
      lng: +f[5],
      population: +f[14] || 0,
      country: COUNTRY_NAMES[country] ?? country,
      admin: adminNames.get(`${country}.${f[10]}`),
      kind: cls === 'A' ? 'A' : 'P',
      primary: [nameKey(f[1]), nameKey(f[2])],
    };
    g.add(nameKey(f[1]), p);
    g.add(nameKey(f[2]), p);
    for (const alt of f[3] ? f[3].split(',') : []) {
      // keep Latin and Cyrillic spellings, skip codes and other scripts
      if (/^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}' ’-]{3,}$/u.test(alt)) g.add(nameKey(alt), p);
    }
  };

  for (const c of FULL) for (const f of rows(new Uint8Array(await readFile(join(dir, `${c}.zip`))))) ingest(f);
  for (const f of rows(new Uint8Array(await readFile(files.cities)))) if (NEIGHBOURS.has(f[8])) ingest(f);
  log(`gazetteer ready: ${g.size} names`);
  return g;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * The town a front "direction" is named after. Sector names are adjectives in
 * Ukrainian (Покровському → Покровськ, Оріхівському → Оріхів, Костянтинівському
 * → Костянтинівка, Гуляйпільському → Гуляйполе, Лиманському → Лиман), and many
 * towns share a name, so prefer a sizeable town near the front.
 */
export function resolveFrontTown(raw: string, g: Gazetteer, front: { lat: number; lng: number }): Place | null {
  const tries = [raw];
  if (/ському$/.test(raw)) {
    tries.push(
      raw.replace(/ському$/, 'ськ'),
      raw.replace(/івському$/, 'івка'),
      raw.replace(/івському$/, 'ів'),
      raw.replace(/пільському$/, 'поле'),
      raw.replace(/ському$/, ''),
    );
  }
  // Towns that officially carry the name beat ones that only had it historically
  // (Donetsk was once "Oleksandrivka"-adjacent names; Zaporizhzhia was Oleksandrivsk).
  const primary = tries.flatMap((t) => g.findPrimary(t)).filter((p) => p.kind === 'P');
  const hits = primary.length ? primary : tries.flatMap((t) => g.find(t)).filter((p) => p.kind === 'P');
  if (!hits.length) return null;
  const score = (p: Place) => distanceKm(p, front) - 40 * Math.log10(p.population + 1);
  const best = [...hits].sort((a, b) => score(a) - score(b))[0];
  return distanceKm(best, front) > 600 ? null : best;
}

/** Rough centre of the front line, used to disambiguate place names. */
export const UKRAINE_FRONT = { lat: 48.5, lng: 37.0 };
