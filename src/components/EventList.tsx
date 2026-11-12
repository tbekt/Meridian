import { memo, useEffect, useMemo, useRef } from 'react';
import { CATEGORY_BY_ID } from '../data/categories';
import type { MapEvent } from '../types';
import { dayBucket, relativeTime } from '../lib/time';
import { Glyph } from './Glyph';
import { Icon, type IconName } from './Icon';

interface Props {
  events: MapEvent[];
  selectedId: string | null;
  freshIds: Set<string>;
  now: number;
  dark: boolean;
  onSelect(id: string): void;
  onHover(id: string | null): void;
  emptyAction?: { label: string; run(): void };
  savedIds?: Set<string>;
  /** blur media thumbnails (war footage can be graphic) */
  blurMedia?: boolean;
  empty?: { icon: IconName; title: string; body: string };
}

export function EventList({
  events,
  selectedId,
  freshIds,
  now,
  dark,
  onSelect,
  onHover,
  emptyAction,
  savedIds,
  blurMedia = true,
  empty = {
    icon: 'search',
    title: 'No events match',
    body: 'Try a wider time range, another region, or fewer filters.',
  },
}: Props) {
  const groups = useMemo(() => {
    const out: { label: string; items: MapEvent[] }[] = [];
    for (const e of events) {
      const label = dayBucket(e.time, now);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [events, now]);

  // keep keyboard/marker selection visible in the list
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  if (!events.length) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <Icon name={empty.icon} size={28} />
        </div>
        <p className="empty-title">{empty.title}</p>
        <p className="empty-body">{empty.body}</p>
        {emptyAction && (
          <button className="pill-button" onClick={emptyAction.run}>
            {emptyAction.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="event-list" ref={listRef} onMouseLeave={() => onHover(null)}>
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="section-head">
            <span>{g.label}</span>
            <span className="tabular">{g.items.length}</span>
          </h3>
          <ul role="list">
            {g.items.map((e) => (
              <Row
                key={e.id}
                event={e}
                selected={e.id === selectedId}
                fresh={freshIds.has(e.id)}
                saved={!!savedIds?.has(e.id)}
                blurMedia={blurMedia}
                now={now}
                dark={dark}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface RowProps {
  event: MapEvent;
  selected: boolean;
  fresh: boolean;
  saved: boolean;
  blurMedia: boolean;
  now: number;
  dark: boolean;
  onSelect(id: string): void;
  onHover(id: string | null): void;
}

const Row = memo(function Row({ event: e, selected, fresh, saved, blurMedia, now, dark, onSelect, onHover }: RowProps) {
  const preview = e.media?.[0];
  const cat = CATEGORY_BY_ID[e.category];
  return (
    <li>
      <button
        data-id={e.id}
        className={`row${selected ? ' is-selected' : ''}${fresh ? ' is-fresh' : ''}`}
        aria-current={selected || undefined}
        onClick={() => onSelect(e.id)}
        onMouseEnter={() => onHover(e.id)}
        onFocus={() => onHover(e.id)}
      >
        <Glyph category={e.category} size={30} dark={dark} />
        <span className="row-body">
          <span className="row-title">{e.title}</span>
          <span className="row-meta">
            <span className="sr-only">{cat.label}. </span>
            {fresh && <span className="badge-new">New</span>}
            <span>{e.location.name}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={e.time}>{relativeTime(e.time, now)}</time>
            {e.verified && (
              <span className="row-verified" title="Reported by two or more outlets">
                <Icon name="seal" size={14} />
                <span className="sr-only">Corroborated</span>
              </span>
            )}
            {saved && (
              <span className="row-saved" title="Saved">
                <Icon name="bookmark" size={13} filled />
                <span className="sr-only">Saved</span>
              </span>
            )}
          </span>
        </span>
        {preview && (preview.thumb || preview.url) && (
          <span className={`row-thumb${blurMedia ? ' is-blurred' : ''}`} aria-hidden="true">
            <img
              src={preview.thumb ?? preview.url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(ev) => ((ev.currentTarget.parentElement as HTMLElement).style.display = 'none')}
            />
            {preview.type === 'video' && <span className="row-thumb-play">▶</span>}
            {(e.media?.length ?? 0) > 1 && <span className="row-thumb-count">{e.media!.length}</span>}
          </span>
        )}
      </button>
    </li>
  );
});
