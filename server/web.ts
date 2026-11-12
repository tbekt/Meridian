/**
 * News websites as sources: RSS feeds and a few site-specific JSON feeds.
 * Articles become posts like Telegram ones (title + summary + image), so they
 * go through the same locating, filtering and translation.
 *
 * Built-in feeds are referenced by short name in WEB_FEEDS; any other RSS feed
 * can be added as "rss:<url>" (optionally "@Home area").
 */
import { createHash } from 'node:crypto';
import { decodeEntities } from './classify.ts';
import type { Post } from './telegram.ts';

export interface WebFeedConfig {
  /** short id, used in event ids */
  id: string;
  /** shown as the source name */
  label: string;
  type: 'rss' | 'i24';
  url: string;
  /** home area used when the config doesn't give one (country-level: only for disambiguation) */
  area?: string;
}

/** Feeds known by name. */
export const BUILTIN_FEEDS: Record<string, WebFeedConfig> = {
  alarabytv: { id: 'alarabytv', label: 'Alaraby TV', type: 'rss', url: 'https://www.alaraby.com/rss', area: 'Israel' },
  i24news: { id: 'i24news', label: 'i24NEWS', type: 'i24', url: 'https://api.i24news.tv/v2/en/contents?limit=40', area: 'Israel' },
  aljazeera: { id: 'aljazeera', label: 'Al Jazeera English', type: 'rss', url: 'https://www.aljazeera.com/xml/rss/all.xml', area: 'Israel' },
  timesofisrael: { id: 'timesofisrael', label: 'The Times of Israel', type: 'rss', url: 'https://www.timesofisrael.com/feed/', area: 'Israel' },
  jpost: { id: 'jpost', label: 'The Jerusalem Post', type: 'rss', url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', area: 'Israel' },
  memo: { id: 'memo', label: 'Middle East Monitor', type: 'rss', url: 'https://www.middleeastmonitor.com/feed/', area: 'Israel' },
};

const UA = 'Mozilla/5.0 (compatible; Meridian/0.1; +live event map)';
const idOf = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
};
const stripHtml = (s: string) =>
  decodeEntities(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').trim();

function parseRss(xml: string, feed: WebFeedConfig): Post[] {
  const posts: Post[] = [];
  for (const raw of xml.split(/<item[\s>]/i).slice(1)) {
    const item = raw.split(/<\/item>/i)[0];
    const title = stripHtml(tag(item, 'title'));
    const link = decodeEntities(tag(item, 'link'));
    const date = tag(item, 'pubDate') || tag(item, 'dc:date') || tag(item, 'published');
    if (!title || !link || !date) continue;
    const time = new Date(date);
    if (Number.isNaN(+time)) continue;
    const summary = stripHtml(tag(item, 'description'));
    const image =
      item.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i)?.[1] ??
      item.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i)?.[1];
    posts.push({
      platform: 'web',
      channel: feed.id,
      id: idOf(link),
      url: link,
      time: time.toISOString(),
      text: summary && summary !== title ? `${title}\n${summary}` : title,
      links: [],
      media: image ? [{ type: 'photo', url: decodeEntities(image), playable: true }] : undefined,
    });
  }
  return posts;
}

interface I24Article {
  title: string;
  excerpt?: string;
  publishedAt: string;
  frontendUrl: string;
  image?: { href?: string };
}

function parseI24(json: I24Article[], feed: WebFeedConfig): Post[] {
  return json
    .filter((a) => a.title && a.frontendUrl && a.publishedAt)
    .map((a) => ({
      platform: 'web' as const,
      channel: feed.id,
      id: idOf(a.frontendUrl),
      url: a.frontendUrl,
      time: new Date(a.publishedAt).toISOString(),
      text: a.excerpt ? `${a.title}\n${a.excerpt}` : a.title,
      links: [],
      media: a.image?.href ? [{ type: 'photo' as const, url: a.image.href, playable: true }] : undefined,
    }));
}

/** Latest articles from one feed. */
export async function fetchWebFeed(feed: WebFeedConfig): Promise<Post[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(feed.url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
    if (!res.ok) throw new Error(`${feed.label}: ${res.status}`);
    return feed.type === 'i24' ? parseI24((await res.json()) as I24Article[], feed) : parseRss(await res.text(), feed);
  } finally {
    clearTimeout(timer);
  }
}

/** "alarabytv,i24news,rss:https://example.com/feed@Gaza" → feed configs (+ optional home area). */
export function parseWebFeeds(spec: string): { feed: WebFeedConfig; area?: string }[] {
  const out: { feed: WebFeedConfig; area?: string }[] = [];
  for (const raw of spec.split(/[,\n]/)) {
    let entry = raw.trim();
    if (!entry) continue;
    let area: string | undefined;
    const at = entry.lastIndexOf('@');
    if (at > 0 && !entry.slice(at).includes('/')) {
      area = entry.slice(at + 1).trim() || undefined;
      entry = entry.slice(0, at);
    }
    const builtin = BUILTIN_FEEDS[entry.toLowerCase()];
    if (builtin) {
      out.push({ feed: builtin, area: area ?? builtin.area });
    } else if (/^rss:https?:\/\//i.test(entry)) {
      const url = entry.slice(4);
      const host = new URL(url).hostname.replace(/^www\./, '');
      out.push({ feed: { id: host.replace(/\W+/g, '_'), label: host, type: 'rss', url }, area });
    }
  }
  return out;
}
