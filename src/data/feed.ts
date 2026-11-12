/**
 * Event feed adapters.
 *
 * The UI only depends on the `EventFeed` interface. By default the app reads
 * the live GDELT-backed feed served at /api/events (see server/). Set
 * VITE_FEED=mock to use generated sample data instead, or VITE_FEED_URL to
 * point at another endpoint that speaks the same protocol.
 */
import type { MapEvent } from '../types';
import { generateBacklog, generateLiveEvent } from './mock';

export interface EventFeed {
  /** Human-readable name shown in the UI */
  readonly name: string;
  /** True when the data is not real */
  readonly isSample: boolean;
  /** Short description of where events come from and how reliable they are */
  readonly note: string;
  /** Load the initial backlog (newest first is not required). */
  load(): Promise<MapEvent[]>;
  /** Subscribe to new or updated events. Returns an unsubscribe function. */
  subscribe(onEvents: (events: MapEvent[]) => void): () => void;
}

/** Fictional events, with a new one arriving every 15–40 seconds. */
export function createMockFeed(): EventFeed {
  return {
    name: 'Sample data',
    isSample: true,
    note: 'Events are fictional placeholders.',
    async load() {
      await new Promise((r) => setTimeout(r, 450));
      return generateBacklog();
    },
    subscribe(onEvents) {
      let timer: ReturnType<typeof setTimeout>;
      const tick = () => {
        timer = setTimeout(() => {
          onEvents([generateLiveEvent()]);
          tick();
        }, 15_000 + Math.random() * 25_000);
      };
      tick();
      return () => clearTimeout(timer);
    },
  };
}

interface FeedResponse {
  events: MapEvent[];
  cursor: number;
  backfilling?: boolean;
}

/**
 * Polls an endpoint returning `{ events, cursor }` (or a bare `MapEvent[]`).
 * Each poll sends the last cursor so only new or updated events come back.
 */
export function createHttpFeed(url: string, pollMs = 60_000): EventFeed {
  let cursor = 0;
  let backfilling = false;

  const get = async (): Promise<MapEvent[]> => {
    const u = new URL(url, window.location.href);
    if (cursor) u.searchParams.set('cursor', String(cursor));
    const res = await fetch(u, { cache: 'no-store' });
    if (!res.ok) throw new Error(`The feed responded with status ${res.status}.`);
    const body = (await res.json()) as FeedResponse | MapEvent[];
    if (Array.isArray(body)) {
      cursor = Date.now();
      return body;
    }
    cursor = body.cursor;
    backfilling = !!body.backfilling;
    return body.events;
  };

  return {
    name: 'GDELT and Telegram',
    isSample: false,
    note: 'News reports and Telegram channel posts, machine-classified and geolocated. Not independently verified.',
    load: get,
    subscribe(onEvents) {
      let timer: ReturnType<typeof setTimeout>;
      let stopped = false;
      const tick = () => {
        // poll quickly while the server is still downloading history
        timer = setTimeout(
          async () => {
            try {
              const fresh = await get();
              if (fresh.length && !stopped) onEvents(fresh);
            } catch {
              /* transient — try again next tick */
            }
            if (!stopped) tick();
          },
          backfilling ? 8_000 : pollMs,
        );
      };
      tick();
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    },
  };
}

export function createFeed(): EventFeed {
  if (import.meta.env.VITE_FEED === 'mock') return createMockFeed();
  const url = (import.meta.env.VITE_FEED_URL as string | undefined) || '/api/events';
  return createHttpFeed(url, Number(import.meta.env.VITE_FEED_POLL_MS) || 60_000);
}
