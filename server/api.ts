/**
 * HTTP handlers for the live feed, shared by the Vite dev/preview servers
 * (vite.config.ts) and the standalone production server (server/index.ts).
 *
 *   GET /api/events?cursor=<ms>                → { events: MapEvent[], cursor, backfilling }
 *   GET /api/status                            → ingestion status per source
 *   GET /api/media/tg/<channel>/<post>/<index> → redirect to a fresh Telegram photo/video link
 *   GET /api/territory?region=<id>             → occupied areas for ukraine / israel-palestine
 *
 * Sources (FEED_SOURCES, default "gdelt,telegram"):
 *   gdelt     GDELT news monitoring (server/gdelt.ts)
 *   telegram  public Telegram channels (TELEGRAM_CHANNELS) and X accounts
 *             (X_ACCOUNTS, needs X_BEARER_TOKEN) — server/telegram.ts, server/x.ts
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { startGdeltFeed, type LiveFeed } from './gdelt.ts';
import { startTelegramFeed, type ChannelConfig, type SocialFeed } from './telegram.ts';
import { startTerritoryFeed, type TerritoryFeed } from './territory.ts';
import { parseWebFeeds } from './web.ts';

/**
 * Telegram channels to follow, as "username@Home area". The home area is where
 * posts that name no specific place are shown (a city, or "Ukraine" for
 * country-wide channels); leave it off for channels whose posts should only
 * appear when they name a place.
 */
const DEFAULT_CHANNELS = 'lumsrc@Ukraine,GeneralStaffZSU@Ukraine';

/** Server settings live in .env / .env.local (Vite only exposes VITE_* to the browser). */
function loadEnvFiles() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    const vars = parseEnv(readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(vars)) if (process.env[k] === undefined && v !== '') process.env[k] = v;
  }
}

const TME_LINK = /^https?:\/\/(t\.me|telegram\.me)\/(s\/)?/i;
const X_LINK = /^https?:\/\/(www\.)?(x|twitter)\.com\//i;

/**
 * Accepts "name", "@name", "name@Area", t.me links (https://t.me/name/123@Area)
 * and X links (https://x.com/name/status/123@Area). `platform` is the default
 * for bare names.
 */
export function parseChannels(spec: string, platform: 'telegram' | 'x' = 'telegram'): ChannelConfig[] {
  const out: ChannelConfig[] = [];
  for (const raw of spec.split(/[,\n]/)) {
    let entry = raw.trim().replace(/^@/, '');
    if (!entry) continue;
    let area: string | undefined;
    const at = entry.lastIndexOf('@');
    if (at > 0) {
      area = entry.slice(at + 1).trim() || undefined;
      entry = entry.slice(0, at);
    }
    const isX = X_LINK.test(entry) || (platform === 'x' && !TME_LINK.test(entry));
    const name = entry.replace(TME_LINK, '').replace(X_LINK, '').split(/[/?#]/)[0];
    // Telegram usernames are 5+ characters; X handles 1–15
    const valid = isX ? /^[A-Za-z0-9_]{1,15}$/.test(name) : /^[A-Za-z0-9_]{4,}$/.test(name);
    const p = isX ? 'x' : 'telegram';
    if (valid && !out.some((c) => (c.platform ?? 'telegram') === p && c.name.toLowerCase() === name.toLowerCase())) {
      out.push({ name, area, platform: p });
    }
  }
  return out;
}

let feeds: Record<string, LiveFeed> | null = null;
let social: SocialFeed | null = null;
let territory: TerritoryFeed | null = null;

function getFeeds(): Record<string, LiveFeed> {
  if (feeds) return feeds;
  loadEnvFiles();
  const sources = (process.env.FEED_SOURCES ?? 'gdelt,telegram').split(',').map((s) => s.trim());
  feeds = {};
  if (sources.includes('gdelt')) {
    feeds.gdelt = startGdeltFeed({
      cacheFile: process.env.GDELT_CACHE_FILE ?? '.cache/gdelt-events.json',
      backlogHours: Number(process.env.GDELT_BACKLOG_HOURS) || 24,
    });
  }
  if (sources.includes('telegram')) {
    const channels = [
      ...parseChannels(process.env.TELEGRAM_CHANNELS ?? DEFAULT_CHANNELS),
      ...parseChannels(process.env.X_ACCOUNTS ?? '', 'x'),
      // news sites (RSS / JSON): WEB_FEEDS=alarabytv,i24news,rss:https://…
      ...parseWebFeeds(process.env.WEB_FEEDS ?? '').map(({ feed, area }) => ({
        name: feed.id,
        platform: 'web' as const,
        web: feed,
        area,
      })),
    ];
    feeds.telegram = social = startTelegramFeed({
      channels,
      cacheFile: process.env.TELEGRAM_CACHE_FILE ?? '.cache/telegram-posts.json',
      geonamesDir: process.env.GEONAMES_DIR ?? '.cache/geonames',
      pollMs: Number(process.env.TELEGRAM_POLL_MS) || 120_000,
      xToken: process.env.X_BEARER_TOKEN || undefined,
      xPollMs: Number(process.env.X_POLL_MS) || 5 * 60_000,
      webPollMs: Number(process.env.WEB_POLL_MS) || 5 * 60_000,
    });
  }
  if (process.env.TERRITORY !== 'off') {
    territory = startTerritoryFeed({ cacheDir: process.env.TERRITORY_CACHE_DIR ?? '.cache' });
  }
  return feeds;
}

/** Start ingesting as soon as the server boots, not on the first request. */
export function warmUp() {
  getFeeds();
}

/**
 * Stop every feed. Vite restarts its server inside the same process when server
 * files change; without this the old feeds keep running next to the new ones
 * (duplicate downloads, and several translation models at once can crash Node).
 */
export function shutdown() {
  for (const f of Object.values(feeds ?? {})) f.stop();
  territory?.stop();
  feeds = null;
  social = null;
  territory = null;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

const MEDIA_PATH = /^\/api\/media\/tg\/([A-Za-z0-9_]{4,})\/(\d+)\/(\d+)$/;

export async function handleApi(req: IncomingMessage, res: ServerResponse, next?: () => void) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const all = Object.values(getFeeds());
  if (url.pathname === '/api/status') {
    return json(res, 200, Object.fromEntries(Object.entries(getFeeds()).map(([k, f]) => [k, f.status()])));
  }

  // Occupied and contested areas (DeepStateMap)
  if (url.pathname === '/api/territory') {
    const region = url.searchParams.get('region') ?? 'ukraine';
    if (region !== 'ukraine' && region !== 'israel-palestine') return json(res, 404, { error: 'No territory layer for this region' });
    const t = territory?.get(region);
    if (!t) return json(res, 503, { error: 'Territory data not loaded yet' });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=900');
    return res.end(JSON.stringify(t));
  }

  // Telegram's CDN links expire, so the client asks here and gets redirected to a fresh one.
  const media = url.pathname.match(MEDIA_PATH);
  if (media) {
    const target = social
      ? await social.mediaUrl(media[1], media[2], Number(media[3]), url.searchParams.has('thumb')).catch(() => null)
      : null;
    if (!target) return json(res, 404, { error: 'Media not available' });
    res.statusCode = 302;
    res.setHeader('Location', target);
    res.setHeader('Cache-Control', 'private, max-age=600');
    return res.end();
  }

  if (url.pathname !== '/api/events') return next ? next() : json(res, 404, { error: 'Not found' });

  const cursor = Number(url.searchParams.get('cursor')) || 0;
  // On a cold start (no cache yet) give the first downloads a moment so the
  // initial response isn't empty.
  if (cursor === 0) {
    const until = Date.now() + 20_000;
    const empty = () => all.every((f) => f.status().events === 0) && all.some((f) => f.status().backfilling);
    while (empty() && Date.now() < until) await new Promise((r) => setTimeout(r, 500));
  }
  const now = Date.now();
  const events = all.flatMap((f) => f.since(cursor).events);
  json(res, 200, { events, cursor: now, backfilling: all.some((f) => f.status().backfilling) });
}
