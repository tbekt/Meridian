/**
 * Territorial control layers, one per region:
 *
 *  - ukraine: Russian-occupied areas and the contested "grey zone" from
 *    DeepStateMap (https://deepstatemap.live), a Ukrainian open-source
 *    front-line map updated daily. Data © DeepState; attributed on the map.
 *    Only the current situation in Ukraine is kept (occupied areas including
 *    Crimea and the areas occupied since 2014, and areas of unknown status);
 *    DeepState's historical "liberated" layers and political shapes elsewhere
 *    are dropped.
 *
 *  - israel-palestine: territories occupied by Israel since 1967 — the West
 *    Bank including East Jerusalem, the Golan Heights and the Shebaa Farms —
 *    from Natural Earth (public domain), plus the part of the Gaza Strip held
 *    by Israeli forces (east of the ceasefire "Yellow Line"). There is no open,
 *    regularly updated dataset of that line, so it is an approximate schematic
 *    (GAZA_LINE below) cut out of Natural Earth's Gaza boundary; the rest of
 *    Gaza is drawn as an outline only.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** occupied / contested: Ukraine. israeli: held by Israel. outline: boundary only, no fill. */
export type ControlStatus = 'occupied' | 'contested' | 'israeli' | 'outline';
export type TerritoryRegion = 'ukraine' | 'israel-palestine';

export interface Territory {
  region: TerritoryRegion;
  /** when the source published this version (ms) */
  updated: number;
  source: { name: string; url: string };
  /** one line for the legend: what the red areas are */
  description: string;
  /** true for fixed boundaries (no live updates) */
  static?: boolean;
  geojson: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { status: ControlStatus; name?: string }>;
}

/** Drop the altitude some sources store with every point (smaller payload). */
function flatten(coords: unknown): unknown {
  if (Array.isArray(coords) && typeof coords[0] === 'number') return [coords[0], coords[1]];
  return Array.isArray(coords) ? coords.map(flatten) : coords;
}

const polygons = (f: GeoJSON.Feature) =>
  f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') ? f.geometry : null;

// ── Ukraine: DeepStateMap ────────────────────────────────────────────────────
const DEEPSTATE = 'https://deepstatemap.live/api/history/last';

interface DeepStateResponse {
  id: number;
  map: GeoJSON.FeatureCollection;
}

/** DeepState names are "Ukrainian /// English /// key". */
function deepStateStatus(name: string): ControlStatus | null {
  const english = (name.split('///')[1] ?? name).trim();
  if (/^occupied$/i.test(english) || /occupied crimea|occupied tuzla|^cadr|calr/i.test(english)) return 'occupied';
  if (/unknown status/i.test(english)) return 'contested';
  return null;
}

async function loadUkraine(): Promise<Territory> {
  const res = await fetch(DEEPSTATE, { headers: { 'User-Agent': 'Meridian/0.1 (live event map)' } });
  if (!res.ok) throw new Error(`DeepState responded ${res.status}`);
  const raw = (await res.json()) as DeepStateResponse;
  const features: Territory['geojson']['features'] = [];
  for (const f of raw.map.features) {
    const g = polygons(f);
    const status = deepStateStatus(String(f.properties?.name ?? ''));
    if (!g || !status) continue;
    features.push({ type: 'Feature', properties: { status }, geometry: { type: g.type, coordinates: flatten(g.coordinates) } as GeoJSON.Polygon });
  }
  return {
    region: 'ukraine',
    // DeepState's id is the publication time in seconds
    updated: raw.id > 1e9 && raw.id < 1e10 ? raw.id * 1000 : Date.now(),
    source: { name: 'DeepStateMap', url: 'https://deepstatemap.live' },
    description: 'Russian-occupied areas and the contested grey zone',
    geojson: { type: 'FeatureCollection', features },
  };
}

// ── Israel–Palestine: Natural Earth ──────────────────────────────────────────
const NATURAL_EARTH =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_disputed_areas.geojson';

type Pt = [number, number];

/**
 * Approximate western edge of the Israeli-held zone in Gaza, north coast → south
 * coast: the ceasefire "Yellow Line" as it stood after being moved west during
 * 2026. A schematic drawn from published maps and descriptions (the line runs
 * east of Gaza City, Deir al-Balah and Khan Yunis; Beit Hanoun, eastern Khan
 * Yunis and all of Rafah are on the Israeli side). Not survey data: edit the
 * points here when the line moves.
 */
const GAZA_LINE: Pt[] = [
  [34.475, 31.575],
  [34.49, 31.558],
  [34.507, 31.546],
  [34.5, 31.527],
  [34.482, 31.508],
  [34.462, 31.489],
  [34.43, 31.466],
  [34.401, 31.439],
  [34.366, 31.409],
  [34.331, 31.377],
  [34.312, 31.347],
  [34.288, 31.323],
  [34.262, 31.328],
  [34.23, 31.337],
];
const GAZA_LINE_AS_OF = Date.UTC(2026, 9, 1);

const KX = Math.cos((31.4 * Math.PI) / 180);
const dist2 = (a: Pt, b: Pt) => ((a[0] - b[0]) * KX) ** 2 + (a[1] - b[1]) ** 2;
const ringArea = (r: Pt[]) => Math.abs(r.reduce((sum, p, i) => sum + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0)) / 2;

/** Nearest point on the ring to p: the segment it lies on and the point itself. */
function snap(ring: Pt[], p: Pt) {
  let best = { i: 0, pt: ring[0], d: Infinity };
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const len = dist2(a, b) || 1e-12;
    const t = Math.max(0, Math.min(1, (((p[0] - a[0]) * KX) * ((b[0] - a[0]) * KX) + (p[1] - a[1]) * (b[1] - a[1])) / len));
    const pt: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = dist2(p, pt);
    if (d < best.d) best = { i, pt, d };
  }
  return best;
}

/**
 * The part of a territory on the landward (eastern) side of a line that runs
 * from one point on its boundary to another.
 */
function landwardOf(ring: Pt[], line: Pt[]): { polygon: Pt[]; share: number } {
  const open = ring.slice(0, -1); // GeoJSON rings repeat the first point
  const start = snap(ring, line[0]);
  const end = snap(ring, line[line.length - 1]);
  // the two ways round the boundary from the line's end back to its start
  const walk = (dir: 1 | -1) => {
    const out: Pt[] = [];
    let i = dir === 1 ? (end.i + 1) % open.length : end.i;
    const stop = dir === 1 ? (start.i + 1) % open.length : start.i;
    for (let n = 0; n <= open.length && i !== stop; n++) {
      out.push(open[i]);
      i = (i + dir + open.length) % open.length;
    }
    return out;
  };
  // The line runs coast to coast, so one way round is the short stretch of coast
  // between its ends and the other is the land border: the longer one.
  const length = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.sqrt(dist2(pts[i - 1], p)) : 0), 0);
  const a = walk(1);
  const b = walk(-1);
  const inland = length(a) >= length(b) ? a : b;
  const polygon: Pt[] = [start.pt, ...line.slice(1, -1), end.pt, ...inland, start.pt];
  return { polygon, share: ringArea(polygon) / ringArea(ring) };
}

/** Detailed Gaza Strip boundary: geoBoundaries (CC BY 4.0), thinned to every third point. */
const GEOBOUNDARIES_PSE =
  'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/PSE/ADM1/geoBoundaries-PSE-ADM1.geojson';

async function detailedGaza(): Promise<GeoJSON.Polygon | null> {
  try {
    const res = await fetch(GEOBOUNDARIES_PSE, { headers: { 'User-Agent': 'Meridian/0.1 (live event map)' } });
    if (!res.ok) return null;
    const raw = (await res.json()) as GeoJSON.FeatureCollection;
    const g = raw.features.map((f) => (f.properties?.shapeName === 'Gaza' ? polygons(f) : null)).find(Boolean);
    if (!g) return null;
    const outer = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]) as Pt[];
    const thinned = outer.filter((_, i) => i % 3 === 0 || i === outer.length - 1).map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)] as Pt);
    if (dist2(thinned[0], thinned[thinned.length - 1]) > 0) thinned.push(thinned[0]);
    return thinned.length > 20 ? { type: 'Polygon', coordinates: [thinned] } : null;
  } catch {
    return null;
  }
}

/** Natural Earth units occupied by Israel since 1967. */
const ISRAELI_OCCUPIED = /^(West Bank|East Jerusalem|Gaza|Golan Heights|Shebaa Farms|Mount Scopus|No Man's Land \((Jerusalem|Fort Latrun)\))$/;

async function loadIsraelPalestine(): Promise<Territory> {
  const res = await fetch(NATURAL_EARTH, { headers: { 'User-Agent': 'Meridian/0.1 (live event map)' } });
  if (!res.ok) throw new Error(`Natural Earth responded ${res.status}`);
  const raw = (await res.json()) as GeoJSON.FeatureCollection;
  const features: Territory['geojson']['features'] = [];
  let gazaShare = 0;
  for (const f of raw.features) {
    const name = String(f.properties?.BRK_NAME ?? f.properties?.NAME ?? '');
    const g = polygons(f);
    if (!g || !ISRAELI_OCCUPIED.test(name)) continue;
    let geometry = { type: g.type, coordinates: flatten(g.coordinates) } as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    if (name !== 'Gaza') {
      features.push({ type: 'Feature', properties: { status: 'israeli', name }, geometry });
      continue;
    }
    // Gaza: the whole Strip as an outline, and the Israeli-held part filled in.
    // Natural Earth's Gaza is too coarse at city zoom; prefer the detailed boundary.
    geometry = (await detailedGaza()) ?? geometry;
    features.push({ type: 'Feature', properties: { status: 'outline' }, geometry });
    const rings = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map((p) => p[0] as Pt[]);
    const ring = rings.sort((x, y) => ringArea(y) - ringArea(x))[0];
    const held = landwardOf(ring, GAZA_LINE);
    gazaShare = Math.round(held.share * 20) * 5; // to the nearest 5%
    features.push({
      type: 'Feature',
      properties: { status: 'israeli', name: 'Israeli-held (approx.)' },
      geometry: { type: 'Polygon', coordinates: [held.polygon] },
    });
  }
  return {
    region: 'israel-palestine',
    updated: GAZA_LINE_AS_OF,
    source: { name: 'Natural Earth, geoBoundaries', url: 'https://www.geoboundaries.org' },
    description: `West Bank incl. East Jerusalem, the Golan Heights, and the part of Gaza held by Israeli forces (about ${gazaShare}% of the Strip; the line is approximate)`,
    static: true,
    geojson: { type: 'FeatureCollection', features },
  };
}

// ── Feed ─────────────────────────────────────────────────────────────────────
const LOADERS: Record<TerritoryRegion, { load: () => Promise<Territory>; refreshMs: number | null }> = {
  // DeepState updates about once a day
  ukraine: { load: loadUkraine, refreshMs: 3 * 3_600_000 },
  // fixed boundaries: fetched once, then kept from the cache
  'israel-palestine': { load: loadIsraelPalestine, refreshMs: null },
};

export interface TerritoryFeed {
  get(region: string): Territory | null;
  stop(): void;
}

export function startTerritoryFeed(opts: { cacheDir: string; log?: (m: string) => void }): TerritoryFeed {
  const log = opts.log ?? ((m: string) => console.log(`[territory] ${m}`));
  const current = new Map<TerritoryRegion, Territory>();
  const timers: ReturnType<typeof setInterval>[] = [];
  // bump the suffix when a loader's output changes, so the cached copy is rebuilt
  const cacheFile = (r: TerritoryRegion) => `${opts.cacheDir}/territory-${r}${r === 'israel-palestine' ? '-v2' : ''}.json`;

  const refresh = async (region: TerritoryRegion) => {
    try {
      const next = await LOADERS[region].load();
      if (!next.geojson.features.length) throw new Error('no areas in the response');
      const prev = current.get(region);
      current.set(region, next);
      if (!prev || prev.updated !== next.updated) {
        log(`${region}: ${next.geojson.features.length} areas from ${next.source.name}`);
        await mkdir(dirname(cacheFile(region)), { recursive: true });
        await writeFile(`${cacheFile(region)}.tmp`, JSON.stringify(next));
        await rename(`${cacheFile(region)}.tmp`, cacheFile(region));
      }
    } catch (e) {
      log(`${region}: update failed: ${(e as Error).message}${current.has(region) ? ' — keeping the last version' : ''}`);
    }
  };

  for (const region of Object.keys(LOADERS) as TerritoryRegion[]) {
    void (async () => {
      try {
        current.set(region, JSON.parse(await readFile(cacheFile(region), 'utf8')) as Territory);
      } catch {
        /* first run */
      }
      const { refreshMs } = LOADERS[region];
      if (refreshMs || !current.has(region)) await refresh(region);
      if (refreshMs) timers.push(setInterval(() => void refresh(region), refreshMs));
    })();
  }

  return {
    get: (region) => current.get(region as TerritoryRegion) ?? null,
    stop: () => timers.forEach(clearInterval),
  };
}
