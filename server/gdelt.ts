/**
 * Live event feed built from the GDELT Project's Global Knowledge Graph.
 *
 * GDELT publishes a file every 15 minutes listing the world's news articles
 * with their headline, outlet and the places they mention (with coordinates):
 * https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/
 *
 * Pipeline per file: unzip → keep articles whose headline describes a conflict
 * event (classify.ts) → choose the location the headline is about → merge
 * syndicated copies of the same story into one event with several sources.
 * Results are cached on disk so history accumulates across restarts.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MapEvent } from '../src/types.ts';
import { regionFor } from '../src/data/regions.ts';
import { findAbroad, topicOf } from './countries.ts';
import { classify, cleanTitle } from './classify.ts';

const BASE = 'https://data.gdeltproject.org/gdeltv2';
const SLOT_MS = 15 * 60_000;
const KEEP_MS = 7 * 24 * 3_600_000;

export interface FeedOptions {
  /** How far back to download on first start (hours). */
  backlogHours?: number;
  /** Where to persist events between restarts. */
  cacheFile?: string;
  pollMs?: number;
  log?: (msg: string) => void;
}

interface Stored {
  event: MapEvent;
  /** server time the event was created or last gained a source */
  updatedAt: number;
}

interface Cache {
  version: 2;
  slots: string[];
  events: Stored[];
}

export interface LiveFeed {
  /** Events changed after `cursor` (server ms), plus the next cursor. */
  since(cursor: number): { events: MapEvent[]; cursor: number };
  status(): { slotsLoaded: number; events: number; latestSlot: string | null; backfilling: boolean };
  stop(): void;
}

// ── Slot helpers ─────────────────────────────────────────────────────────────
const slotId = (t: number) => new Date(t).toISOString().replace(/[-:T]/g, '').slice(0, 14);
const slotTime = (id: string) =>
  Date.UTC(+id.slice(0, 4), +id.slice(4, 6) - 1, +id.slice(6, 8), +id.slice(8, 10), +id.slice(10, 12), +id.slice(12, 14));
const floorSlot = (t: number) => Math.floor(t / SLOT_MS) * SLOT_MS;

async function fetchWithTimeout(url: string, ms: number) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Latest slot GDELT has announced (files can lag the announcement by ~30 min). */
async function latestAnnounced(): Promise<number> {
  const res = await fetchWithTimeout(`${BASE}/lastupdate.txt`, 20_000);
  const text = await res.text();
  const m = text.match(/(\d{14})\.export/);
  return m ? slotTime(m[1]) : floorSlot(Date.now() - 30 * 60_000);
}

// ── Parsing ──────────────────────────────────────────────────────────────────
interface Loc {
  type: number;
  full: string;
  lat: number;
  lng: number;
  offset: number;
}

const DEMONYMS: Record<string, string> = {
  American: 'United States', Iranian: 'Iran', Israeli: 'Israel', Russian: 'Russia', Ukrainian: 'Ukraine',
  Chinese: 'China', Syrian: 'Syria', Lebanese: 'Lebanon', Palestinian: 'Palestine', Iraqi: 'Iraq',
  Yemeni: 'Yemen', Afghan: 'Afghanistan', Pakistani: 'Pakistan', Indian: 'India', Turkish: 'Turkey',
  Sudanese: 'Sudan', Somali: 'Somalia', British: 'United Kingdom', French: 'France', German: 'Germany',
  Mexican: 'Mexico', Venezuelan: 'Venezuela', Colombian: 'Colombia', Japanese: 'Japan', Taiwanese: 'Taiwan',
  Korean: 'South Korea', Saudi: 'Saudi Arabia', Egyptian: 'Egypt', Libyan: 'Libya', Nigerian: 'Nigeria',
  Ethiopian: 'Ethiopia', Congolese: 'DR Congo', Burmese: 'Myanmar', Filipino: 'Philippines', Polish: 'Poland',
  Belarusian: 'Belarus', Georgian: 'Georgia', Armenian: 'Armenia', Azerbaijani: 'Azerbaijan', Malian: 'Mali',
  Haitian: 'Haiti', Australian: 'Australia', Canadian: 'Canada', Brazilian: 'Brazil', Argentine: 'Argentina',
  Jordanian: 'Jordan', Qatari: 'Qatar', Emirati: 'United Arab Emirates', Kenyan: 'Kenya',
};

function parseLocations(v2: string, v1: string): Loc[] {
  const out: Loc[] = [];
  const raw = v2 || v1;
  if (!raw) return out;
  for (const entry of raw.split(';')) {
    const f = entry.split('#');
    if (f.length < 7) continue;
    const lat = parseFloat(f[5]);
    const lng = parseFloat(f[6]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    out.push({ type: +f[0], full: f[1], lat, lng, offset: f[8] ? +f[8] : 99_999 });
  }
  return out;
}

const stemOf = (word: string) => word.slice(0, Math.min(word.length, Math.max(4, word.length - 2))).toLowerCase();

/** Choose the place the headline is about. Returns null if nothing is credible. */
function pickLocation(locs: Loc[], title: string): Loc | null {
  const lower = title.toLowerCase();
  let best: Loc | null = null;
  let bestScore = -Infinity;
  for (const l of locs) {
    const parts = l.full.split(',').map((s) => s.trim());
    const name = parts[0];
    const country = parts[parts.length - 1];
    let score = 0;
    const cityLevel = l.type === 3 || l.type === 4;
    if (cityLevel) score += 3;
    else if (l.type === 2 || l.type === 5) score += 1;
    if (name.length > 2 && new RegExp(`\\b${escapeRe(name.toLowerCase())}`).test(lower)) score += 6;
    else if (lower.includes(stemOf(DEMONYMS[country] ?? country))) score += 3;
    score -= Math.min(2, l.offset / 2_000); // places mentioned early matter more
    if (score > bestScore) {
      best = l;
      bestScore = score;
    }
  }
  // A bare country centroid is only useful when the headline names that country.
  return bestScore >= 2.5 ? best : null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function splitPlace(full: string) {
  // GDELT sometimes replaces non-ASCII letters with "?" ("Ar Riya?") — drop those parts
  const all = full.split(',').map((s) => s.trim()).filter(Boolean);
  const clean = all.filter((s, i) => i === 0 || i === all.length - 1 || !s.includes('?'));
  const parts = clean.map((s) => s.replace(/\?/g, ''));
  const country = DEMONYMS[parts[parts.length - 1]] ?? parts[parts.length - 1];
  const name = parts.length === 1 ? country : parts[0];
  const admin = parts.length >= 3 ? parts[1] : undefined;
  return { name, admin, country };
}

/** Normalised headline used to merge syndicated copies of the same story. */
const storyKey = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);

function parseSlot(csv: string): MapEvent[] {
  const byKey = new Map<string, MapEvent>();
  for (const line of csv.split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    if (f.length < 27) continue;
    const extras = f[26];
    const tm = extras.match(/<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/);
    if (!tm) continue;
    const domain = f[3];
    const url = f[4];
    if (!/^https?:\/\//.test(url)) continue;
    const title = cleanTitle(tm[1], domain);
    const category = classify(title);
    if (!category) continue;
    const loc = pickLocation(parseLocations(f[10], f[9]), title);
    if (!loc) continue;

    const key = storyKey(title);
    // GDELT stamps files with the end of their window, which can be ahead of the clock
    const time = new Date(Math.min(slotTime(f[1]), Date.now())).toISOString();
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.sources.some((s) => s.name === domain)) existing.sources.push({ name: domain, url, kind: 'media' });
      continue;
    }
    const place = splitPlace(loc.full);
    const precise = loc.type === 3 || loc.type === 4;
    // Country / province centroids get a small spread so markers don't stack.
    const jitter = precise ? 0 : 0.35;
    const h = createHash('sha1').update(key).digest();
    const lat = loc.lat + ((h[0] / 255) - 0.5) * jitter;
    const lng = loc.lng + ((h[1] / 255) - 0.5) * jitter * 1.4;
    byKey.set(key, relocateAbroad({
      id: `g-${h.toString('hex').slice(0, 12)}`,
      title,
      category,
      region: regionFor(lat, lng),
      location: {
        name: place.name,
        admin: place.admin,
        country: place.country,
        lat,
        lng,
        precision: precise ? 'exact' : 'approximate',
      },
      time,
      sources: [{ name: domain, url, kind: 'media' }],
      verified: false,
      origin: 'gdelt',
      provenance: precise
        ? `Location “${loc.full}” extracted from the article text by GDELT.`
        : `Approximate location: “${loc.full}” (region-level) extracted from the article text by GDELT.`,
    }));
  }
  return [...byKey.values()];
}

/**
 * GDELT often files diplomacy under the country being discussed ("Abu Dhabi
 * talks on Ukraine" → the middle of Ukraine). When a report is only located at
 * country level and its headline is about another country — a venue, or a
 * government speaking — show it there, and keep the war as its topic so it
 * still appears on that war's tab.
 */
function relocateAbroad(e: MapEvent): MapEvent {
  if (e.location.precision !== 'approximate' || e.topic) return e;
  const topic = topicOf(e.title);
  const abroad = topic ? findAbroad(e.title) : null;
  if (!topic || !abroad || abroad.country.name === e.location.country) return e;
  const c = abroad.country;
  return {
    ...e,
    category: abroad.via === 'speaker' ? 'politics' : e.category,
    region: regionFor(c.lat, c.lng),
    topic,
    location: { name: c.capital, country: c.name, lat: c.lat, lng: c.lng, precision: 'approximate' },
    provenance: `The headline is about ${c.name}; shown at ${c.capital}. GDELT had filed it under “${e.location.name}”.`,
  };
}

// ── Feed ─────────────────────────────────────────────────────────────────────
export function startGdeltFeed(opts: FeedOptions = {}): LiveFeed {
  const backlogHours = opts.backlogHours ?? 24;
  const pollMs = opts.pollMs ?? 5 * 60_000;
  const log = opts.log ?? ((m: string) => console.log(`[gdelt] ${m}`));
  const store = new Map<string, Stored>();
  const byStory = new Map<string, string>(); // storyKey → id
  const loaded = new Set<string>();
  let latestSlot: string | null = null;
  let backfilling = false;
  let stopped = false;
  let dirty = false;

  const ingest = (events: MapEvent[]) => {
    const now = Date.now();
    let added = 0;
    for (const e of events) {
      const key = storyKey(e.title);
      const id = byStory.get(key) ?? e.id;
      const prev = store.get(id);
      if (!prev) {
        store.set(id, { event: { ...e, id }, updatedAt: now });
        byStory.set(key, id);
        added++;
        continue;
      }
      // Same story seen again: add new outlets, keep the earliest time.
      let changed = false;
      for (const s of e.sources) {
        if (!prev.event.sources.some((x) => x.name === s.name)) {
          prev.event.sources.push(s);
          changed = true;
        }
      }
      if (e.time < prev.event.time) {
        prev.event.time = e.time;
        changed = true;
      }
      if (changed) {
        prev.event.verified = prev.event.sources.length > 1;
        prev.updatedAt = now;
      }
    }
    for (const s of store.values()) s.event.verified = s.event.sources.length > 1;
    if (events.length) dirty = true;
    return added;
  };

  const prune = () => {
    const cutoff = Date.now() - KEEP_MS;
    for (const [id, s] of store) {
      if (+new Date(s.event.time) < cutoff) {
        store.delete(id);
        byStory.delete(storyKey(s.event.title));
      }
    }
    for (const id of loaded) if (slotTime(id) < cutoff) loaded.delete(id);
  };

  const loadSlot = async (id: string): Promise<'ok' | 'missing' | 'error'> => {
    try {
      const res = await fetchWithTimeout(`${BASE}/${id}.gkg.csv.zip`, 60_000);
      if (res.status === 404) return 'missing';
      if (!res.ok) return 'error';
      const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
      const file = Object.values(zip)[0];
      if (!file) return 'error';
      // GDELT files are UTF-8; latin1 fallback keeps a bad byte from killing the slot.
      let csv: string;
      try {
        csv = strFromU8(file);
      } catch {
        csv = strFromU8(file, true);
      }
      const added = ingest(parseSlot(csv));
      loaded.add(id);
      if (!latestSlot || id > latestSlot) latestSlot = id;
      log(`${id}: +${added} events (${store.size} total)`);
      return 'ok';
    } catch (e) {
      log(`${id}: ${(e as Error).message}`);
      return 'error';
    }
  };

  /** Load every slot from newest to `from` that isn't loaded yet. */
  const sync = async (fromMs: number) => {
    let latest: number;
    try {
      latest = await latestAnnounced();
    } catch (e) {
      log(`lastupdate: ${(e as Error).message}`);
      return;
    }
    const wanted: string[] = [];
    for (let t = latest; t >= fromMs; t -= SLOT_MS) {
      const id = slotId(t);
      if (!loaded.has(id)) wanted.push(id);
    }
    // newest first so the UI fills from the top; small concurrency to be polite
    const queue = [...wanted];
    const worker = async () => {
      while (queue.length && !stopped) await loadSlot(queue.shift()!);
    };
    await Promise.all([worker(), worker(), worker()]);
    prune();
    await persist();
  };

  const persist = async () => {
    if (!opts.cacheFile || !dirty) return;
    dirty = false;
    const data: Cache = { version: 2, slots: [...loaded], events: [...store.values()] };
    try {
      await mkdir(dirname(opts.cacheFile), { recursive: true });
      const tmp = `${opts.cacheFile}.tmp`;
      await writeFile(tmp, JSON.stringify(data));
      await rename(tmp, opts.cacheFile);
    } catch (e) {
      log(`cache write failed: ${(e as Error).message}`);
    }
  };

  const restore = async () => {
    if (!opts.cacheFile) return;
    try {
      const data = JSON.parse(await readFile(opts.cacheFile, 'utf8')) as Cache;
      if (data.version !== 2) return;
      for (const s of data.events) {
        // caches written before `precision` existed
        s.event.origin ??= 'gdelt';
        s.event.location.precision ??= s.event.provenance?.startsWith('Approximate') ? 'approximate' : 'exact';
        s.event = relocateAbroad(s.event);
        const loc = s.event.location;
        if (loc.admin?.includes('?')) loc.admin = undefined;
        loc.name = loc.name.replace(/\?/g, '');
        // re-run title cleanup so rule improvements apply to cached events too
        s.event.title = cleanTitle(s.event.title, s.event.sources[0]?.name ?? '');
        store.set(s.event.id, s);
        byStory.set(storyKey(s.event.title), s.event.id);
      }
      for (const id of data.slots) loaded.add(id);
      latestSlot = data.slots.sort().at(-1) ?? null;
      prune();
      log(`restored ${store.size} events from cache`);
    } catch {
      /* no cache yet */
    }
  };

  let timer: ReturnType<typeof setInterval> | undefined;
  const ready = (async () => {
    await restore();
    backfilling = true;
    // Recent hours first so the map is useful quickly, then the rest.
    await sync(floorSlot(Date.now() - 3 * 3_600_000));
    await sync(floorSlot(Date.now() - backlogHours * 3_600_000));
    backfilling = false;
    // Files can appear late, so each poll re-checks the last 3 hours of slots.
    timer = setInterval(() => void sync(floorSlot(Date.now() - 3 * 3_600_000)), pollMs);
  })();
  ready.catch((e) => log(`startup failed: ${(e as Error).message}`));

  return {
    since(cursor) {
      const now = Date.now();
      const events: MapEvent[] = [];
      for (const s of store.values()) if (s.updatedAt > cursor) events.push(s.event);
      return { events, cursor: now };
    },
    status: () => ({ slotsLoaded: loaded.size, events: store.size, latestSlot, backfilling }),
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
