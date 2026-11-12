import { useMemo, useRef, useState } from 'react';
import type { MapEvent, TimeRange, TimeWindow } from '../types';
import { RANGE_LABEL, RANGE_MS, clockTime } from '../lib/time';
import { Icon } from './Icon';

const BUCKETS: Record<TimeRange, number> = { '6h': 36, '24h': 48, '3d': 72, '7d': 84 };
const RANGES: TimeRange[] = ['6h', '24h', '3d', '7d'];

interface Props {
  /** Events already filtered by region/category/search — but not by time. */
  events: MapEvent[];
  range: TimeRange;
  brush: TimeWindow | null;
  now: number;
  onRange(r: TimeRange): void;
  onBrush(w: TimeWindow | null): void;
  compact?: boolean;
}

/**
 * The signature element: an activity histogram that doubles as the time filter.
 * Drag across it to narrow the window; click once to clear.
 */
export function TimeRibbon({ events, range, brush, now, onRange, onBrush, compact }: Props) {
  const span = RANGE_MS[range];
  const start = now - span;
  const n = BUCKETS[range];
  const bucketMs = span / n;

  const counts = useMemo(() => {
    const c = new Array<number>(n).fill(0);
    for (const e of events) {
      const t = +new Date(e.time);
      if (t < start || t > now) continue;
      c[Math.min(n - 1, Math.floor((t - start) / bucketMs))] += 1;
    }
    return c;
  }, [events, start, now, n, bucketMs]);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<[number, number] | null>(null);

  const fracAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const toWindow = (a: number, b: number): TimeWindow => ({
    start: start + Math.min(a, b) * span,
    end: start + Math.max(a, b) * span,
  });

  const active = draft ? toWindow(draft[0], draft[1]) : brush;
  const inWindow = (i: number) => {
    if (!active) return true;
    const b0 = start + i * bucketMs;
    return b0 + bucketMs > active.start && b0 < active.end;
  };

  const W = 100;
  const H = compact ? 34 : 40;
  const gap = 0.28;
  const bw = W / n - gap;

  return (
    <div className={`ribbon${compact ? ' ribbon--compact' : ''}`}>
      <div className="ribbon-head">
        <div className="segmented" role="radiogroup" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={range === r}
              className={range === r ? 'is-on' : ''}
              onClick={() => {
                onRange(r);
                onBrush(null);
              }}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="ribbon-readout" aria-live="polite">
          {brush ? (
            <>
              <span className="tabular">
                {clockTime(brush.start)} – {clockTime(brush.end)}
              </span>
              <button className="chip-clear" onClick={() => onBrush(null)} aria-label="Clear time selection">
                <Icon name="close" size={14} />
              </button>
            </>
          ) : (
            <span className="tabular">
              {total} {total === 1 ? 'event' : 'events'}
            </span>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        className="ribbon-bars"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Activity over the last ${RANGE_LABEL[range]}: ${total} events. Drag to select a time window.`}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const f = fracAt(e.clientX);
          drag.current = { x0: f, moved: false };
          setDraft(null);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const f = fracAt(e.clientX);
          if (Math.abs(f - drag.current.x0) > 0.01) drag.current.moved = true;
          if (drag.current.moved) setDraft([drag.current.x0, f]);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setDraft(null);
          if (!d) return;
          if (d.moved) onBrush(toWindow(d.x0, fracAt(e.clientX)));
          else onBrush(null);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDraft(null);
        }}
      >
        {active && (
          <rect
            className="ribbon-brush"
            x={((active.start - start) / span) * W}
            y={0}
            width={Math.max(0.6, ((active.end - active.start) / span) * W)}
            height={H}
            rx={1.2}
          />
        )}
        {counts.map((c, i) => {
          const h = c === 0 ? 1.2 : 3 + (c / max) * (H - 7);
          return (
            <rect
              key={i}
              className={inWindow(i) ? 'bar is-in' : 'bar'}
              x={i * (W / n) + gap / 2}
              y={H - h - 2}
              width={bw}
              height={h}
              rx={Math.min(0.5, bw / 2)}
            />
          );
        })}
      </svg>

      <div className="ribbon-axis" aria-hidden="true">
        <span>{range === '6h' || range === '24h' ? clockTime(start) : new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
        <span className="ribbon-now">
          <i className="live-dot" /> Now
        </span>
      </div>
    </div>
  );
}
