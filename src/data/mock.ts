/**
 * Sample data generator. Produces realistic-looking events with the same shape
 * a real feed would return. Everything here is fictional placeholder content.
 */
import type { CategoryId, EventSource, MapEvent, RegionId } from '../types';

type R = Exclude<RegionId, 'world' | 'europe' | 'israel-palestine'>;

interface Place {
  name: string;
  admin?: string;
  country: string;
  lat: number;
  lng: number;
  /** open water — only naval / air-defense events */
  sea?: boolean;
  coast?: boolean;
}

const PLACES: Record<R, Place[]> = {
  ukraine: [
    { name: 'Kyiv', admin: 'Kyiv Oblast', country: 'Ukraine', lat: 50.45, lng: 30.52 },
    { name: 'Kharkiv', admin: 'Kharkiv Oblast', country: 'Ukraine', lat: 49.99, lng: 36.23 },
    { name: 'Odesa', admin: 'Odesa Oblast', country: 'Ukraine', lat: 46.48, lng: 30.72, coast: true },
    { name: 'Dnipro', admin: 'Dnipropetrovsk Oblast', country: 'Ukraine', lat: 48.46, lng: 35.05 },
    { name: 'Zaporizhzhia', admin: 'Zaporizhzhia Oblast', country: 'Ukraine', lat: 47.84, lng: 35.14 },
    { name: 'Kherson', admin: 'Kherson Oblast', country: 'Ukraine', lat: 46.64, lng: 32.61 },
    { name: 'Mykolaiv', admin: 'Mykolaiv Oblast', country: 'Ukraine', lat: 46.97, lng: 31.99, coast: true },
    { name: 'Sumy', admin: 'Sumy Oblast', country: 'Ukraine', lat: 50.91, lng: 34.8 },
    { name: 'Chernihiv', admin: 'Chernihiv Oblast', country: 'Ukraine', lat: 51.49, lng: 31.29 },
    { name: 'Lviv', admin: 'Lviv Oblast', country: 'Ukraine', lat: 49.84, lng: 24.03 },
    { name: 'Pokrovsk', admin: 'Donetsk Oblast', country: 'Ukraine', lat: 48.28, lng: 37.18 },
    { name: 'Kramatorsk', admin: 'Donetsk Oblast', country: 'Ukraine', lat: 48.72, lng: 37.56 },
    { name: 'Sloviansk', admin: 'Donetsk Oblast', country: 'Ukraine', lat: 48.85, lng: 37.6 },
    { name: 'Kostiantynivka', admin: 'Donetsk Oblast', country: 'Ukraine', lat: 48.53, lng: 37.71 },
    { name: 'Nikopol', admin: 'Dnipropetrovsk Oblast', country: 'Ukraine', lat: 47.57, lng: 34.4 },
    { name: 'Kupiansk', admin: 'Kharkiv Oblast', country: 'Ukraine', lat: 49.71, lng: 37.61 },
    { name: 'Poltava', admin: 'Poltava Oblast', country: 'Ukraine', lat: 49.59, lng: 34.55 },
    { name: 'Kryvyi Rih', admin: 'Dnipropetrovsk Oblast', country: 'Ukraine', lat: 47.91, lng: 33.39 },
    { name: 'Huliaipole', admin: 'Zaporizhzhia Oblast', country: 'Ukraine', lat: 47.66, lng: 36.26 },
    { name: 'Vinnytsia', admin: 'Vinnytsia Oblast', country: 'Ukraine', lat: 49.23, lng: 28.47 },
    { name: 'Izmail', admin: 'Odesa Oblast', country: 'Ukraine', lat: 45.35, lng: 28.84, coast: true },
    { name: 'Sevastopol', admin: 'Crimea', country: 'Ukraine', lat: 44.62, lng: 33.53, coast: true },
    { name: 'Belgorod', admin: 'Belgorod Oblast', country: 'Russia', lat: 50.6, lng: 36.59 },
    { name: 'Kursk', admin: 'Kursk Oblast', country: 'Russia', lat: 51.73, lng: 36.19 },
    { name: 'Novorossiysk', admin: 'Krasnodar Krai', country: 'Russia', lat: 44.72, lng: 37.77, coast: true },
    { name: 'Black Sea', country: 'International waters', lat: 44.6, lng: 31.6, sea: true },
  ],
  'middle-east': [
    { name: 'Gaza City', admin: 'Gaza Strip', country: 'Palestine', lat: 31.5, lng: 34.47, coast: true },
    { name: 'Khan Younis', admin: 'Gaza Strip', country: 'Palestine', lat: 31.35, lng: 34.31 },
    { name: 'Rafah', admin: 'Gaza Strip', country: 'Palestine', lat: 31.29, lng: 34.25 },
    { name: 'Jenin', admin: 'West Bank', country: 'Palestine', lat: 32.46, lng: 35.3 },
    { name: 'Tel Aviv', admin: 'Tel Aviv District', country: 'Israel', lat: 32.08, lng: 34.78, coast: true },
    { name: 'Haifa', admin: 'Haifa District', country: 'Israel', lat: 32.79, lng: 34.99, coast: true },
    { name: 'Beirut', admin: 'Beirut Governorate', country: 'Lebanon', lat: 33.89, lng: 35.5, coast: true },
    { name: 'Tyre', admin: 'South Governorate', country: 'Lebanon', lat: 33.27, lng: 35.2, coast: true },
    { name: 'Nabatieh', admin: 'Nabatieh Governorate', country: 'Lebanon', lat: 33.38, lng: 35.48 },
    { name: 'Damascus', admin: 'Damascus Governorate', country: 'Syria', lat: 33.51, lng: 36.29 },
    { name: 'Aleppo', admin: 'Aleppo Governorate', country: 'Syria', lat: 36.2, lng: 37.13 },
    { name: 'Idlib', admin: 'Idlib Governorate', country: 'Syria', lat: 35.93, lng: 36.63 },
    { name: 'Deir ez-Zor', admin: 'Deir ez-Zor Governorate', country: 'Syria', lat: 35.33, lng: 40.14 },
    { name: "Sana'a", admin: "Sana'a Governorate", country: 'Yemen', lat: 15.37, lng: 44.19 },
    { name: 'Hodeidah', admin: 'Hodeidah Governorate', country: 'Yemen', lat: 14.8, lng: 42.95, coast: true },
    { name: 'Red Sea', country: 'International waters', lat: 15.6, lng: 41.2, sea: true },
    { name: 'Gulf of Aden', country: 'International waters', lat: 12.8, lng: 47.2, sea: true },
    { name: 'Baghdad', admin: 'Baghdad Governorate', country: 'Iraq', lat: 33.31, lng: 44.36 },
    { name: 'Erbil', admin: 'Kurdistan Region', country: 'Iraq', lat: 36.19, lng: 44.01 },
    { name: 'Amman', admin: 'Amman Governorate', country: 'Jordan', lat: 31.95, lng: 35.93 },
    { name: 'Tehran', admin: 'Tehran Province', country: 'Iran', lat: 35.69, lng: 51.39 },
  ],
  africa: [
    { name: 'Khartoum', admin: 'Khartoum State', country: 'Sudan', lat: 15.5, lng: 32.56 },
    { name: 'Omdurman', admin: 'Khartoum State', country: 'Sudan', lat: 15.64, lng: 32.48 },
    { name: 'El Fasher', admin: 'North Darfur', country: 'Sudan', lat: 13.63, lng: 25.35 },
    { name: 'Nyala', admin: 'South Darfur', country: 'Sudan', lat: 12.05, lng: 24.88 },
    { name: 'Port Sudan', admin: 'Red Sea State', country: 'Sudan', lat: 19.62, lng: 37.22, coast: true },
    { name: 'Bamako', admin: 'Bamako District', country: 'Mali', lat: 12.64, lng: -8.0 },
    { name: 'Gao', admin: 'Gao Region', country: 'Mali', lat: 16.27, lng: -0.04 },
    { name: 'Timbuktu', admin: 'Timbuktu Region', country: 'Mali', lat: 16.77, lng: -3.01 },
    { name: 'Niamey', admin: 'Niamey', country: 'Niger', lat: 13.51, lng: 2.11 },
    { name: 'Ouagadougou', admin: 'Centre Region', country: 'Burkina Faso', lat: 12.37, lng: -1.52 },
    { name: 'Maiduguri', admin: 'Borno State', country: 'Nigeria', lat: 11.85, lng: 13.16 },
    { name: 'Mogadishu', admin: 'Banaadir', country: 'Somalia', lat: 2.05, lng: 45.32, coast: true },
    { name: 'Goma', admin: 'North Kivu', country: 'DR Congo', lat: -1.68, lng: 29.23 },
    { name: 'Bunia', admin: 'Ituri', country: 'DR Congo', lat: 1.56, lng: 30.25 },
    { name: 'Juba', admin: 'Central Equatoria', country: 'South Sudan', lat: 4.86, lng: 31.57 },
  ],
  'asia-pacific': [
    { name: 'Taipei', admin: 'Taipei', country: 'Taiwan', lat: 25.03, lng: 121.57, coast: true },
    { name: 'Taiwan Strait', country: 'International waters', lat: 24.4, lng: 119.6, sea: true },
    { name: 'Manila', admin: 'Metro Manila', country: 'Philippines', lat: 14.6, lng: 120.98, coast: true },
    { name: 'Scarborough Shoal', country: 'South China Sea', lat: 15.15, lng: 117.76, sea: true },
    { name: 'Second Thomas Shoal', country: 'South China Sea', lat: 9.73, lng: 115.87, sea: true },
    { name: 'Seoul', admin: 'Seoul', country: 'South Korea', lat: 37.57, lng: 126.98 },
    { name: 'Pyongyang', admin: 'Pyongyang', country: 'North Korea', lat: 39.04, lng: 125.76 },
    { name: 'Yangon', admin: 'Yangon Region', country: 'Myanmar', lat: 16.84, lng: 96.17, coast: true },
    { name: 'Mandalay', admin: 'Mandalay Region', country: 'Myanmar', lat: 21.96, lng: 96.09 },
    { name: 'Lashio', admin: 'Shan State', country: 'Myanmar', lat: 22.94, lng: 97.75 },
    { name: 'Myawaddy', admin: 'Kayin State', country: 'Myanmar', lat: 16.69, lng: 98.51 },
    { name: 'Sittwe', admin: 'Rakhine State', country: 'Myanmar', lat: 20.15, lng: 92.9, coast: true },
    { name: 'Hong Kong', country: 'China', lat: 22.32, lng: 114.17, coast: true },
  ],
  americas: [
    { name: 'Port-au-Prince', admin: 'Ouest', country: 'Haiti', lat: 18.54, lng: -72.34, coast: true },
    { name: 'Caracas', admin: 'Capital District', country: 'Venezuela', lat: 10.48, lng: -66.9 },
    { name: 'Bogotá', admin: 'Capital District', country: 'Colombia', lat: 4.71, lng: -74.07 },
    { name: 'Culiacán', admin: 'Sinaloa', country: 'Mexico', lat: 24.81, lng: -107.39 },
    { name: 'Guayaquil', admin: 'Guayas', country: 'Ecuador', lat: -2.19, lng: -79.89, coast: true },
    { name: 'Tegucigalpa', admin: 'Francisco Morazán', country: 'Honduras', lat: 14.07, lng: -87.19 },
    { name: 'Lima', admin: 'Lima', country: 'Peru', lat: -12.05, lng: -77.04, coast: true },
    { name: 'Mexico City', admin: 'CDMX', country: 'Mexico', lat: 19.43, lng: -99.13 },
    { name: 'Rosario', admin: 'Santa Fe', country: 'Argentina', lat: -32.95, lng: -60.65 },
    { name: 'Caribbean Sea', country: 'International waters', lat: 13.6, lng: -70.5, sea: true },
  ],
};

const WEIGHTS: Record<R, Partial<Record<CategoryId, number>>> = {
  ukraine: {
    drone: 10, shelling: 9, missile: 5, airstrike: 5, airdefense: 6, explosion: 6, clashes: 6,
    infrastructure: 4, movement: 3, naval: 2, humanitarian: 2, politics: 3,
  },
  'middle-east': {
    airstrike: 8, missile: 4, drone: 5, shelling: 4, explosion: 4, clashes: 4, airdefense: 4,
    naval: 3, humanitarian: 4, politics: 4, protest: 2,
  },
  africa: { clashes: 8, drone: 4, shelling: 3, humanitarian: 6, movement: 3, politics: 3, protest: 2, explosion: 2 },
  'asia-pacific': { naval: 6, movement: 3, airstrike: 3, clashes: 4, politics: 4, protest: 2, airdefense: 1, missile: 1 },
  americas: { clashes: 5, protest: 4, politics: 4, humanitarian: 2, explosion: 2, naval: 1 },
};

const REGION_SHARE: Record<R, number> = {
  ukraine: 46,
  'middle-east': 26,
  africa: 12,
  'asia-pacific': 9,
  americas: 7,
};

const TITLES: Record<CategoryId, string[]> = {
  airstrike: [
    'Airstrike reported on the outskirts of {place}',
    'Aircraft struck targets near {place}, local officials say',
    'Guided aerial bombs hit {place}; damage to residential buildings reported',
    'Airstrikes reported overnight in {admin}',
  ],
  missile: [
    'Missile strike reported in {place}',
    'Missile impact reported in {place} after air raid sirens',
    'Missile launched toward {admin}; impact reported near {place}',
  ],
  drone: [
    'Drone attack on {place}; air defense active',
    'Attack drones spotted heading toward {place}',
    'Drone struck a vehicle near {place}',
    'Wave of drones reported over {admin}',
  ],
  shelling: [
    'Artillery shelling of {place} reported',
    '{place} shelled overnight, regional administration says',
    'Mortar fire reported near {place}',
    'Shelling damages homes in {place}',
  ],
  explosion: [
    'Explosions heard in {place}',
    'Series of loud explosions reported in {place}',
    'Blast reported near an industrial area in {place}',
  ],
  clashes: [
    'Fighting reported near {place}',
    'Clashes on the approaches to {place}',
    'Armed groups clash in {place}; residents report gunfire',
    'Heavy fighting continues around {place}',
  ],
  airdefense: [
    'Air defense active over {place}',
    'Air raid alert declared in {admin}',
    'Interceptions reported over {place}',
  ],
  movement: [
    'Military convoy observed moving near {place}',
    'Reinforcements reported arriving in the {place} area',
    'Armored column spotted on the road to {place}',
  ],
  naval: [
    'Naval vessels reported operating near {place}',
    'Coast guard activity reported near {place}',
    'Commercial vessel reports an incident near {place}',
    'Warship transit reported through {place}',
  ],
  infrastructure: [
    'Power outages in {place} after strike on energy facility',
    'Damage to rail infrastructure reported near {place}',
    'Water supply disrupted in {place}',
    'Emergency power cuts scheduled across {admin}',
  ],
  humanitarian: [
    'Aid convoy reaches {place}',
    'Evacuation of civilians from {place} under way',
    'Humanitarian pause announced for {place}',
    'Shelters open in {place} as residents are displaced',
  ],
  politics: [
    'Officials in {place} announce new security measures',
    'Delegation arrives in {place} for talks',
    'Curfew extended across {admin}',
    'Government in {place} responds to overnight attacks',
  ],
  protest: [
    'Demonstrators gather in central {place}',
    'Protest reported outside government buildings in {place}',
    'Strike action spreads to {place}',
  ],
};

const SUMMARIES: Record<CategoryId, string> = {
  airstrike: 'Local sources report aerial strikes in the area. Information on damage and casualties is preliminary.',
  missile: 'Air raid sirens preceded the reported impact. Emergency services are working at the scene.',
  drone: 'Unmanned aerial vehicles were reported in the area. Residents were advised to remain in shelters.',
  shelling: 'Artillery fire was reported by local authorities. The extent of damage is being assessed.',
  explosion: 'Witnesses reported explosions. The cause has not yet been confirmed.',
  clashes: 'Ground fighting was reported in the area. Front-line positions could not be independently verified.',
  airdefense: 'Air defense systems were reported active. Residents were asked to stay in shelters until the all-clear.',
  movement: 'Movement of military equipment was observed and shared by local sources.',
  naval: 'Maritime activity was reported in the area. Shipping advisories may be in effect.',
  infrastructure: 'Critical infrastructure was affected. Utilities say repair crews are working to restore service.',
  humanitarian: 'Humanitarian organizations report ongoing operations to assist civilians in the area.',
  politics: 'Officials issued a statement on the situation. Further announcements are expected.',
  protest: 'Crowds gathered peacefully, according to local reports. Security forces were present.',
};

const SOURCE_POOL: Omit<EventSource, 'url'>[] = [
  { name: 'Regional Wire', kind: 'agency' },
  { name: 'Local Correspondent', kind: 'media' },
  { name: 'Regional Administration', kind: 'official' },
  { name: 'Defence Ministry Statement', kind: 'official' },
  { name: 'OSINT Monitor', kind: 'social' },
  { name: 'Field Reporter', kind: 'social' },
  { name: 'Evening Dispatch', kind: 'media' },
  { name: 'Relief Coordination Office', kind: 'ngo' },
];

// ── Deterministic RNG so ids & content are stable across reloads ───────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T extends string>(rand: () => number, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function makeEvent(rand: () => number, id: string, time: number, regionHint?: R): MapEvent {
  const region = regionHint ?? weighted<R>(rand, REGION_SHARE);
  const category = weighted<CategoryId>(rand, WEIGHTS[region]);
  const wantsWater = category === 'naval';
  const candidates = PLACES[region].filter((p) =>
    wantsWater ? p.sea || p.coast : category === 'airdefense' || category === 'drone' ? true : !p.sea,
  );
  const place = pick(rand, candidates.length ? candidates : PLACES[region]);
  const title = pick(rand, TITLES[category])
    .replace('{place}', place.name)
    .replace('{admin}', place.admin ?? place.name);

  // jitter so markers in the same city don't stack perfectly
  const spread = place.sea ? 0.9 : 0.12;
  const lat = place.lat + (rand() - 0.5) * spread;
  const lng = place.lng + (rand() - 0.5) * spread * 1.4;

  const sourceCount = 1 + Math.floor(rand() * rand() * 3);
  const pool = [...SOURCE_POOL];
  const sources: EventSource[] = [];
  for (let i = 0; i < sourceCount; i++) {
    const s = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    sources.push({ ...s, url: `https://example.com/sample/${id}/${i + 1}` });
  }

  return {
    id,
    title,
    summary: SUMMARIES[category],
    category,
    region,
    location: { name: place.name, admin: place.admin, country: place.country, lat, lng },
    time: new Date(time).toISOString(),
    sources,
    verified: sources.length > 1,
  };
}

const HOUR = 3_600_000;

/** Initial backlog spanning the last 7 days, denser toward now. */
export function generateBacklog(count = 280, now = Date.now()): MapEvent[] {
  const rand = mulberry32(20261109);
  const events: MapEvent[] = [];
  for (let i = 0; i < count; i++) {
    // exponential-ish distribution: most events in the last 48h
    const u = rand();
    const ageH = Math.min(168, -Math.log(1 - u * 0.985) * 34);
    events.push(makeEvent(rand, `evt-${(count - i).toString(36)}${i.toString(36)}`, now - ageH * HOUR, undefined));
  }
  return events.sort((a, b) => +new Date(b.time) - +new Date(a.time));
}

let liveCounter = 0;
const liveRand = mulberry32(Date.now() & 0xffffffff);

export function generateLiveEvent(now = Date.now()): MapEvent {
  liveCounter += 1;
  return makeEvent(liveRand, `live-${now.toString(36)}-${liveCounter}`, now);
}
