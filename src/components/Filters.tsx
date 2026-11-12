import { useRef, useState } from 'react';
import { CATEGORIES } from '../data/categories';
import { REGIONS, REGION_BY_ID } from '../data/regions';
import type { CategoryId, RegionId } from '../types';
import { Glyph } from './Glyph';
import { Icon } from './Icon';
import { Popover } from './Popover';

interface FilterProps {
  active: Set<CategoryId>;
  counts: Record<CategoryId, number>;
  verifiedOnly: boolean;
  dark: boolean;
  onChange(next: Set<CategoryId>): void;
  onVerifiedOnly(v: boolean): void;
  sheet?: boolean;
  source: SourceFilter;
  sourceCounts: Record<SourceFilter, number>;
  onSource(s: SourceFilter): void;
}

export type SourceFilter = 'all' | 'gdelt' | 'telegram';
const SOURCE_LABEL: Record<SourceFilter, string> = { all: 'All', gdelt: 'News', telegram: 'Social' };

export function FilterButton(p: FilterProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const filtered = p.active.size < CATEGORIES.length || p.verifiedOnly || p.source !== 'all';
  const hidden = CATEGORIES.length - p.active.size;

  const toggle = (id: CategoryId, only: boolean) => {
    if (only) return p.onChange(new Set([id]));
    const next = new Set(p.active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    p.onChange(next);
  };

  return (
    <div className="popover-anchor">
      <button
        ref={btn}
        className={`tool-button${filtered ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        title="Filter by category (F)"
        aria-label={filtered ? `Filters on${hidden ? `, ${hidden} categories hidden` : ""}` : "Filter"}
        data-shortcut="filter"
      >
        <Icon name="filter" size={18} />
        <span>{filtered ? `Filtered${hidden ? ` · ${hidden} hidden` : ''}` : 'Filter'}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} label="Filter events" className="filter-pop" sheet={p.sheet}>
        <div className="pop-head">
          <span className="pop-title">Sources</span>
        </div>
        <div className="segmented segmented--full source-switch" role="radiogroup" aria-label="Event sources">
          {(['all', 'gdelt', 'telegram'] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={p.source === s}
              className={p.source === s ? 'is-on' : ''}
              onClick={() => p.onSource(s)}
              title={s === 'gdelt' ? 'News sites: GDELT, Alaraby TV, i24NEWS and other feeds' : s === 'telegram' ? 'Telegram channels and X accounts' : undefined}
            >
              {SOURCE_LABEL[s]}
              <span className="tab-count tabular">{p.sourceCounts[s]}</span>
            </button>
          ))}
        </div>
        <div className="pop-head">
          <span className="pop-title">Categories</span>
          <div className="pop-head-actions">
            <button
              className="text-button"
              onClick={() => p.onChange(new Set(CATEGORIES.map((c) => c.id)))}
              disabled={p.active.size === CATEGORIES.length}
            >
              Select All
            </button>
            <button className="text-button" onClick={() => p.onChange(new Set())} disabled={p.active.size === 0}>
              Clear
            </button>
          </div>
        </div>
        <ul className="check-list" role="list">
          {CATEGORIES.map((c) => {
            const on = p.active.has(c.id);
            return (
              <li key={c.id}>
                <button
                  role="checkbox"
                  aria-checked={on}
                  className={`check-row${on ? ' is-on' : ''}`}
                  onClick={(e) => toggle(c.id, e.altKey)}
                  title="Option-click (Alt-click) to show only this category"
                >
                  <Glyph category={c.id} size={22} dark={p.dark} />
                  <span className="check-label">{c.label}</span>
                  <span className="check-count tabular">{p.counts[c.id] ?? 0}</span>
                  <span className="check-mark" aria-hidden="true">
                    {on && <Icon name="check" size={16} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="pop-foot">
          <label className="switch-row">
            <span>
              Corroborated only
              <small>Reported by two or more outlets</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={p.verifiedOnly}
              onChange={(e) => p.onVerifiedOnly(e.target.checked)}
            />
          </label>
        </div>
      </Popover>
    </div>
  );
}

interface RegionProps {
  region: RegionId;
  counts: Partial<Record<RegionId, number>>;
  onChange(r: RegionId): void;
}

export function RegionButton({ region, counts, onChange }: RegionProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className="popover-anchor">
      <button
        ref={btn}
        className="region-button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="region-label">{REGION_BY_ID[region].label}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} label="Choose region" className="region-pop">
        <ul className="menu-list" role="menu">
          {REGIONS.map((r) => (
            <li key={r.id} role="none">
              <button
                role="menuitemradio"
                aria-checked={r.id === region}
                className={`menu-row${r.id === region ? ' is-on' : ''}`}
                onClick={() => {
                  onChange(r.id);
                  setOpen(false);
                  btn.current?.focus();
                }}
              >
                <span className="check-mark" aria-hidden="true">
                  {r.id === region && <Icon name="check" size={16} />}
                </span>
                <span className="check-label">{r.label}</span>
                <span className="check-count tabular">{counts[r.id] ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}
