import { useEffect, useMemo, useState } from 'react';
import type { EventFeed } from '../data/feed';
import type { MapEvent } from '../types';

export type FeedStatus = 'loading' | 'live' | 'error';

/** Loads the backlog, merges live updates, and remembers which ids just arrived. */
export function useEvents(feed: EventFeed) {
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setStatus('loading');
    setError(null);

    feed
      .load()
      .then((initial) => {
        if (cancelled) return;
        setEvents(sortNewest(initial));
        setStatus('live');
        setLastUpdate(Date.now());
        const known = new Set(initial.map((e) => e.id));
        unsubscribe = feed.subscribe((incoming) => {
          setEvents((prev) => {
            const byId = new Map(prev.map((e) => [e.id, e]));
            for (const e of incoming) byId.set(e.id, e);
            return sortNewest([...byId.values()]);
          });
          setLastUpdate(Date.now());
          // Only genuinely new, recent events get the "New" badge — not history
          // arriving in bulk, and not existing events that gained a source.
          const cutoff = Date.now() - 60 * 60_000;
          const fresh = incoming.filter((e) => !known.has(e.id) && +new Date(e.time) > cutoff).map((e) => e.id);
          incoming.forEach((e) => known.add(e.id));
          if (!fresh.length) return;
          setFreshIds((prev) => new Set([...prev, ...fresh]));
          // "New" marker fades after five minutes
          setTimeout(() => {
            setFreshIds((prev) => {
              const next = new Set(prev);
              fresh.forEach((id) => next.delete(id));
              return next;
            });
          }, 300_000);
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : 'The feed could not be reached.');
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [feed, retryKey]);

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  return { events, byId, status, error, freshIds, lastUpdate, retry: () => setRetryKey((k) => k + 1) };
}

function sortNewest(list: MapEvent[]) {
  return [...list].sort((a, b) => +new Date(b.time) - +new Date(a.time));
}
