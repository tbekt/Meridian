/**
 * Posts from X (Twitter) accounts through the official X API v2.
 *
 * X has no public, login-free feed like Telegram's t.me/s preview, so this
 * needs an API bearer token (X_BEARER_TOKEN). X bills reads per post returned
 * (pay-per-use), so the feed asks only for posts newer than the last one seen.
 */
import type { Post, PostMedia } from './telegram.ts';

const API = 'https://api.x.com/2';

interface XMedia {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif';
  url?: string;
  preview_image_url?: string;
  variants?: { content_type: string; bit_rate?: number; url: string }[];
}

interface XTweet {
  id: string;
  text: string;
  created_at: string;
  note_tweet?: { text: string };
  attachments?: { media_keys?: string[] };
}

interface XTimeline {
  data?: XTweet[];
  includes?: { media?: XMedia[] };
  meta?: { newest_id?: string; result_count: number };
  errors?: { detail?: string; title?: string }[];
}

export class XApiError extends Error {
  // (no constructor parameter properties: Node's type stripping doesn't support them)
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const userIds = new Map<string, string>();

async function get<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: string; title?: string };
      detail = body.detail ?? body.title ?? '';
    } catch {
      /* not JSON */
    }
    const hint =
      res.status === 401 ? 'check X_BEARER_TOKEN' :
      res.status === 402 || res.status === 403 ? 'the X developer account has no read access or credit left' :
      res.status === 429 ? 'rate limited — will retry next poll' : '';
    throw new XApiError(`X API ${res.status}${detail ? `: ${detail}` : ''}${hint ? ` (${hint})` : ''}`, res.status);
  }
  return (await res.json()) as T;
}

async function userId(username: string, token: string) {
  const key = username.toLowerCase();
  const cached = userIds.get(key);
  if (cached) return cached;
  const body = await get<{ data?: { id: string } }>(`/users/by/username/${encodeURIComponent(username)}`, token);
  if (!body.data?.id) throw new XApiError(`X account @${username} not found`, 404);
  userIds.set(key, body.data.id);
  return body.data.id;
}

function toMedia(m: XMedia): PostMedia {
  if (m.type === 'photo') return { type: 'photo', url: m.url, playable: !!m.url };
  // videos and GIFs: highest-bitrate MP4
  const mp4 = (m.variants ?? [])
    .filter((v) => v.content_type === 'video/mp4')
    .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0];
  return { type: 'video', url: mp4?.url, thumb: m.preview_image_url, playable: !!mp4 };
}

/**
 * Recent original posts (no reposts or replies) from one account.
 * `sinceId` limits the request — and the bill — to posts not seen yet.
 */
export async function fetchXPosts(username: string, token: string, sinceId?: string, max = 25): Promise<Post[]> {
  const id = await userId(username, token);
  const params = new URLSearchParams({
    max_results: String(Math.min(100, Math.max(5, max))),
    exclude: 'retweets,replies',
    'tweet.fields': 'created_at,attachments,note_tweet',
    expansions: 'attachments.media_keys',
    'media.fields': 'type,url,preview_image_url,variants',
  });
  if (sinceId) params.set('since_id', sinceId);
  const body = await get<XTimeline>(`/users/${id}/tweets?${params}`, token);
  const media = new Map((body.includes?.media ?? []).map((m) => [m.media_key, m]));
  return (body.data ?? []).map((t) => {
    const attached = (t.attachments?.media_keys ?? []).map((k) => media.get(k)).filter((m): m is XMedia => !!m);
    return {
      platform: 'x',
      channel: username,
      id: t.id,
      url: `https://x.com/${username}/status/${t.id}`,
      time: new Date(t.created_at).toISOString(),
      // long posts carry their full text in note_tweet; drop t.co links
      text: (t.note_tweet?.text ?? t.text).replace(/https:\/\/t\.co\/\S+/g, '').trim(),
      links: [],
      media: attached.length ? attached.map(toMedia) : undefined,
    } satisfies Post;
  });
}
