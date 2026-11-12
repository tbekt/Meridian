import { useMemo } from 'react';
import { CATEGORIES } from '../data/categories';
import type { CategoryId, MapEvent } from '../types';
import { Glyph } from './Glyph';
import { Icon } from './Icon';

interface Props {
  /** Events currently in view (all filters applied) */
  events: MapEvent[];
  dark: boolean;
  onOnlyCategory(id: CategoryId): void;
  onPlace(e: MapEvent): void;
}

interface Place {
  key: string;
  name: string;
  country: string;
  count: number;
  approximate: boolean;
  /** most recent event, used to fly to the place */
  latest: MapEvent;
}

/** At-a-glance breakdown of what's in the current view. */
export function Insights({ events, dark, onOnlyCategory, onPlace }: Props) {
  const stats = useMemo(() => {
    const byCat = new Map<CategoryId, number>();
    const places = new Map<string, Place>();
    const outlets = new Map<string, number>();
    let corroborated = 0;
    for (const e of events) {
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);
      if (e.verified) corroborated++;
      const key = `${e.location.name}|${e.location.country}`;
      const p = places.get(key);
      if (p) {
        p.count++;
        if (e.time > p.latest.time) p.latest = e;
      } else {
        places.set(key, {
          key,
          name: e.location.name,
          country: e.location.country,
          count: 1,
          approximate: e.location.precision === 'approximate',
          latest: e,
        });
      }
      for (const s of e.sources) outlets.set(s.name, (outlets.get(s.name) ?? 0) + 1);
    }
    const cats = CATEGORIES.map((c) => ({ ...c, count: byCat.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
    const hotspots = [...places.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    const topOutlets = [...outlets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { cats, hotspots, topOutlets, corroborated, places: places.size };
  }, [events]);

  if (!events.length) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <Icon name="chart" size={28} />
        </div>
        <p className="empty-title">Nothing to summarize</p>
        <p className="empty-body">Insights cover the events that match your current filters.</p>
      </div>
    );
  }

  const max = stats.cats[0]?.count ?? 1;
  const pct = Math.round((stats.corroborated / events.length) * 100);

  return (
    <div className="insights">
      <dl className="stat-grid">
        <div>
          <dt>Events</dt>
          <dd className="tabular">{events.length}</dd>
        </div>
        <div>
          <dt>Places</dt>
          <dd className="tabular">{stats.places}</dd>
        </div>
        <div>
          <dt>Corroborated</dt>
          <dd className="tabular">{pct}%</dd>
        </div>
      </dl>

      <h3 className="detail-section">By category</h3>
      <ul className="bar-list" role="list">
        {stats.cats.map((c) => (
          <li key={c.id}>
            <button
              className="bar-row"
              onClick={() => onOnlyCategory(c.id)}
              title={`Show only ${c.label}`}
              aria-label={`${c.label}: ${c.count} events. Show only this category.`}
            >
              <Glyph category={c.id} size={22} dark={dark} />
              <span className="bar-label">{c.label}</span>
              <span className="bar-track" aria-hidden="true">
                <span
                  className="bar-fill"
                  style={{ width: `${Math.max(4, (c.count / max) * 100)}%`, background: c.color[dark ? 'dark' : 'light'] }}
                />
              </span>
              <span className="bar-count tabular">{c.count}</span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="detail-section">Hotspots</h3>
      <ol className="hotspots">
        {stats.hotspots.map((p, i) => (
          <li key={p.key}>
            <button className="hotspot-row" onClick={() => onPlace(p.latest)}>
              <span className="hotspot-rank tabular" aria-hidden="true">
                {i + 1}
              </span>
              <span className="hotspot-body">
                <span className="hotspot-name">{p.name}</span>
                <span className="hotspot-sub">
                  {p.name === p.country ? 'Country-level reports' : p.country}
                </span>
              </span>
              <span className="bar-count tabular">{p.count}</span>
              <Icon name="chevronRight" size={16} />
            </button>
          </li>
        ))}
      </ol>

      <h3 className="detail-section">Most cited outlets</h3>
      <ul className="outlets" role="list">
        {stats.topOutlets.map(([name, n]) => (
          <li key={name}>
            <span>{name}</span>
            <span className="tabular">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
