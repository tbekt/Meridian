import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFeed } from './data/feed';
import { ALL_CATEGORY_IDS, CATEGORY_BY_ID } from './data/categories';
import { REGION_BY_ID } from './data/regions';
import { useEvents } from './hooks/useEvents';
import { useDarkMode, useLayout, useReducedMotion, useShortViewport } from './hooks/useMediaQuery';
import { useNow } from './hooks/useNow';
import { usePersistentState } from './hooks/usePersistentState';
import { eventUrl, readHash, writeHash } from './lib/hash';
import { RANGE_MS, relativeTime } from './lib/time';
import { TERRITORY_REGIONS, type CategoryId, type MapEvent, type RegionId, type TerritoryData, type TimeRange, type TimeWindow } from './types';
import { MapView, type MapHandle } from './components/MapView';
import { EventList } from './components/EventList';
import { EventDetail } from './components/EventDetail';
import { FilterButton, RegionButton, type SourceFilter } from './components/Filters';
import { TimeRibbon } from './components/TimeRibbon';
import { Sheet, detentHeight, type Detent } from './components/Sheet';
import { Icon, type IconName } from './components/Icon';
import { Insights } from './components/Insights';
import { LayersButton, type LayerSettings } from './components/LayersMenu';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { AboutDialog } from './components/AboutDialog';

const feed = createFeed();
const GUTTER = 16;
const INSPECTOR_W = 364;
const CONTROLS_W = 56;

type Tab = 'events' | 'saved' | 'insights';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'events', label: 'Events', icon: 'list' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
];

const RANGE_TEXT: Record<TimeRange, string> = {
  '6h': 'last 6 hours',
  '24h': 'last 24 hours',
  '3d': 'last 3 days',
  '7d': 'last 7 days',
};

/** News (GDELT) vs social posts (Telegram, X) for the Sources switch. */
const sourceBucket = (e: MapEvent): 'gdelt' | 'telegram' =>
  e.origin === 'telegram' || e.origin === 'x' ? 'telegram' : 'gdelt';

function haversineKm(a: MapEvent, b: MapEvent) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.location.lat - a.location.lat);
  const dLng = toRad(b.location.lng - a.location.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.location.lat)) * Math.cos(toRad(b.location.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function App() {
  const { events, byId, status, error, freshIds, lastUpdate, retry } = useEvents(feed);
  const now = useNow(20_000);
  const dark = useDarkMode();
  const layout = useLayout();
  const short = useShortViewport();
  const compact = layout === 'compact';
  const wide = layout === 'wide';
  const reducedMotion = useReducedMotion();
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const sidebarW = wide ? 380 : Math.min(340, Math.round(vw * 0.42));

  // ── View state ─────────────────────────────────────────────────────────────
  const initial = useMemo(readHash, []);
  const [region, setRegion] = useState<RegionId>(initial.region);
  const [selectedId, setSelectedId] = useState<string | null>(initial.eventId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Set<CategoryId>>(() => new Set(ALL_CATEGORY_IDS));
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [source, setSource] = usePersistentState<SourceFilter>('source', 'all');
  const [query, setQuery] = useState('');
  const [range, setRange] = usePersistentState<TimeRange>('range', '24h');
  const [brush, setBrush] = useState<TimeWindow | null>(null);
  const [detent, setDetent] = useState<Detent>('half');
  const [tab, setTab] = usePersistentState<Tab>('tab', 'events');
  const [panelHidden, setPanelHidden] = usePersistentState('panelHidden', false);
  const [layers, setLayers] = usePersistentState<LayerSettings>('layers', {
    mode: 'markers',
    showApproximate: true,
    follow: false,
    notify: false,
    blurMedia: true,
  });
  const [saved, setSaved] = usePersistentState<MapEvent[]>('saved', []);
  const [helpOpen, setHelpOpen] = useState(false);
  // the disclaimer opens by itself until it has been read once
  const [aboutSeen, setAboutSeen] = usePersistentState('aboutSeen', false);
  const [aboutOpen, setAboutOpen] = useState(!aboutSeen);
  const closeAbout = useCallback(() => {
    setAboutOpen(false);
    setAboutSeen(true);
  }, [setAboutSeen]);

  // Occupied areas belong to their region: Russian-occupied areas only on the
  // Ukraine tab, Israeli-occupied territories only on Israel–Palestine.
  // Loaded when the region is opened, refreshed every 30 minutes.
  const [territories, setTerritories] = useState<Partial<Record<string, TerritoryData>>>({});
  const territoryRegion = (TERRITORY_REGIONS as readonly string[]).includes(region) ? region : null;
  const territory = territoryRegion ? territories[territoryRegion] ?? null : null;
  useEffect(() => {
    if (!territoryRegion) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/territory?region=${territoryRegion}`)
        .then((r) => (r.ok ? (r.json() as Promise<TerritoryData>) : null))
        .then((t) => !cancelled && t && setTerritories((all) => ({ ...all, [territoryRegion]: t })))
        .catch(() => undefined);
    void load();
    const id = setInterval(load, 30 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [territoryRegion]);

  const mapRef = useRef<MapHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const showPanel = compact || !panelHidden;

  useEffect(() => writeHash({ region, eventId: selectedId }), [region, selectedId]);
  useEffect(() => {
    const on = () => {
      const h = readHash();
      setRegion(h.region);
      setSelectedId(h.eventId);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const window_: TimeWindow = brush ?? { start: now - RANGE_MS[range], end: now + 60_000 };
  const q = query.trim().toLowerCase();

  const matches = useCallback(
    (e: MapEvent, skip: { region?: boolean; category?: boolean; time?: boolean; source?: boolean } = {}) => {
      if (!skip.source && source !== 'all' && sourceBucket(e) !== source) return false;
      if (!skip.region && region !== 'world' && e.region !== region && e.topic !== region) return false;
      if (!skip.category && !categories.has(e.category)) return false;
      if (verifiedOnly && !e.verified) return false;
      if (!layers.showApproximate && e.location.precision === 'approximate') return false;
      if (!skip.time) {
        const t = +new Date(e.time);
        if (t < window_.start || t > window_.end) return false;
      }
      if (q) {
        const hay = `${e.title} ${e.location.name} ${e.location.admin ?? ''} ${e.location.country}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },
    [region, categories, verifiedOnly, source, layers.showApproximate, window_.start, window_.end, q],
  );

  const visible = useMemo(() => events.filter((e) => matches(e)), [events, matches]);
  const forRibbon = useMemo(() => events.filter((e) => matches(e, { time: true })), [events, matches]);
  const categoryCounts = useMemo(() => {
    const c = Object.fromEntries(ALL_CATEGORY_IDS.map((id) => [id, 0])) as Record<CategoryId, number>;
    for (const e of events) if (matches(e, { category: true })) c[e.category] += 1;
    return c;
  }, [events, matches]);
  const sourceCounts = useMemo(() => {
    const c: Record<SourceFilter, number> = { all: 0, gdelt: 0, telegram: 0 };
    for (const e of events) {
      if (!matches(e, { source: true })) continue;
      c.all += 1;
      c[sourceBucket(e)] += 1;
    }
    return c;
  }, [events, matches]);
  const regionCounts = useMemo(() => {
    const c: Partial<Record<RegionId, number>> = { world: 0 };
    for (const e of events) {
      if (!matches(e, { region: true })) continue;
      c.world! += 1;
      if (e.region !== 'other') c[e.region] = (c[e.region] ?? 0) + 1;
      if (e.topic && e.topic !== e.region) c[e.topic] = (c[e.topic] ?? 0) + 1;
    }
    return c;
  }, [events, matches]);

  // Saved events keep a snapshot so they outlive the feed's 7-day window;
  // the live copy wins when it exists (it may have gained sources).
  const savedIds = useMemo(() => new Set(saved.map((e) => e.id)), [saved]);
  const savedEvents = useMemo(
    () => saved.map((e) => byId.get(e.id) ?? e).sort((a, b) => +new Date(b.time) - +new Date(a.time)),
    [saved, byId],
  );

  const selected = selectedId ? byId.get(selectedId) ?? saved.find((e) => e.id === selectedId) ?? null : null;
  // J/K step through whichever list is on screen
  const stepList = tab === 'saved' ? savedEvents : visible;
  const selectedIndex = selected ? stepList.findIndex((e) => e.id === selected.id) : -1;

  const nearby = useMemo(() => {
    if (!selected) return [];
    return events
      .filter((e) => e.id !== selected.id && Math.abs(+new Date(e.time) - +new Date(selected.time)) < 72 * 3_600_000)
      .map((e) => ({ e, d: haversineKm(selected, e) }))
      .filter((x) => x.d < 60)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map((x) => x.e);
  }, [selected, events]);

  // ── Layout-aware map padding ───────────────────────────────────────────────
  const inspectorOpen = wide && !!selected;
  const rightInset = inspectorOpen ? INSPECTOR_W + GUTTER * 2 : GUTTER;
  const leftInset = showPanel ? sidebarW + GUTTER * 2 : GUTTER;
  const padding = compact
    ? { top: GUTTER, left: GUTTER, right: GUTTER, bottom: detentHeight(detent, vh) }
    : { top: GUTTER, left: leftInset, right: rightInset + CONTROLS_W, bottom: short ? 96 : 132 };

  // ── Actions ────────────────────────────────────────────────────────────────
  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!id) return;
      if (compact) setDetent((d) => (d === 'peek' ? 'half' : d));
      // in the medium layout details live inside the panel, so reveal it
      if (layout === 'medium') setPanelHidden(false);
    },
    [compact, layout, setPanelHidden],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!stepList.length) return;
      const i = selectedIndex < 0 ? (dir === 1 ? 0 : stepList.length - 1) : selectedIndex + dir;
      const next = stepList[Math.max(0, Math.min(stepList.length - 1, i))];
      if (next) select(next.id);
    },
    [stepList, selectedIndex, select],
  );

  const toggleSave = useCallback(
    (e: MapEvent) =>
      setSaved((list) => (list.some((x) => x.id === e.id) ? list.filter((x) => x.id !== e.id) : [e, ...list])),
    [setSaved],
  );

  const changeRegion = (r: RegionId) => {
    setRegion(r);
    setSelectedId(null);
  };

  // fit region bounds on change (and on first load)
  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current && initial.eventId) {
      firstFit.current = false;
      return; // deep link: the map flies to the event instead
    }
    firstFit.current = false;
    const t = setTimeout(() => mapRef.current?.fitBounds(REGION_BY_ID[region].bounds), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const resetFilters = () => {
    setCategories(new Set(ALL_CATEGORY_IDS));
    setVerifiedOnly(false);
    setSource('all');
    setQuery('');
    setBrush(null);
    setRange('7d');
    setLayers((l) => ({ ...l, showApproximate: true }));
  };

  // ── Live: follow + notifications for newly arrived events ──────────────────
  const handledFresh = useRef(new Set<string>());
  const liveRef = useRef({ layers, matches, select });
  liveRef.current = { layers, matches, select };
  useEffect(() => {
    const arrivals = [...freshIds].filter((id) => !handledFresh.current.has(id));
    arrivals.forEach((id) => handledFresh.current.add(id));
    const { layers: l, matches: m, select: sel } = liveRef.current;
    const relevant = arrivals
      .map((id) => byId.get(id))
      .filter((e): e is MapEvent => !!e && m(e))
      .sort((a, b) => +new Date(b.time) - +new Date(a.time));
    if (!relevant.length) return;
    const newest = relevant[0];
    if (l.follow) mapRef.current?.flyTo(newest.location.lng, newest.location.lat);
    if (l.notify && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      for (const e of relevant.slice(0, 3)) {
        const n = new Notification(`${CATEGORY_BY_ID[e.category].label} · ${e.location.name}`, {
          body: e.title,
          tag: e.id,
          icon: '/favicon.svg',
        });
        n.onclick = () => {
          window.focus();
          sel(e.id);
          n.close();
        };
      }
    }
  }, [freshIds, byId]);

  // Keyboard shortcuts (see ShortcutsDialog for the list)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if (e.key === 'Escape') {
        if (typing && t === searchRef.current) {
          if (query) setQuery('');
          else searchRef.current?.blur();
          return;
        }
        if (selectedId) select(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === '/') {
        e.preventDefault();
        if (compact) setDetent('full');
        else setPanelHidden(false);
        setTimeout(() => searchRef.current?.focus());
      } else if (k === 'j' || (k === 'ArrowDown' && selectedId)) {
        e.preventDefault();
        step(1);
      } else if (k === 'k' || (k === 'ArrowUp' && selectedId)) {
        e.preventDefault();
        step(-1);
      } else if (k === 'f') {
        document.querySelector<HTMLButtonElement>('[data-shortcut="filter"]')?.click();
      } else if (k === 'l') {
        document.querySelector<HTMLButtonElement>('[data-shortcut="layers"]')?.click();
      } else if (k === 'h') {
        setLayers((l) => ({ ...l, mode: l.mode === 'heatmap' ? 'markers' : 'heatmap' }));
      } else if (k === 's' && selected) {
        toggleSave(selected);
      } else if (k === '1' || k === '2' || k === '3') {
        setTab(TABS[+k - 1].id);
        setSelectedId(null);
      } else if (k === '\\' && !compact) {
        setPanelHidden((h) => !h);
      } else if (k === '?') {
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, select, selectedId, selected, query, compact, toggleSave, setLayers, setTab, setPanelHidden]);

  // ── Pieces ─────────────────────────────────────────────────────────────────
  const statusPill = (
    <span
      className={`status status--${status}`}
      title={lastUpdate ? `Updated ${relativeTime(lastUpdate, now).toLowerCase()}` : undefined}
    >
      <i className="live-dot" aria-hidden="true" />
      {status === 'loading' ? 'Connecting…' : status === 'error' ? 'Offline' : 'Live'}
    </span>
  );

  const hidePanelButton = !compact && (
    <button
      className="icon-button"
      onClick={() => setPanelHidden(true)}
      aria-label="Hide side panel"
      title="Hide panel (\)"
    >
      <Icon name="sidebar" size={18} />
    </button>
  );

  const summaryLine = (
    <p className="summary-line tabular">
      {status === 'loading'
        ? 'Loading events…'
        : `${visible.length} ${visible.length === 1 ? 'event' : 'events'} · ${brush ? 'selected window' : RANGE_TEXT[range]}`}
    </p>
  );

  const searchRow = (
    <div className="search-row">
      <label className="search-field">
        <Icon name="search" size={17} />
        <span className="sr-only">Search events</span>
        <input
          ref={searchRef}
          type="search"
          placeholder="Search places and events"
          value={query}
          enterKeyHint="search"
          onChange={(e) => {
            setQuery(e.target.value);
            if (tab === 'saved') setTab('events');
          }}
          onFocus={() => compact && setDetent('full')}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
            <Icon name="close" size={14} />
          </button>
        )}
      </label>
      <FilterButton
        active={categories}
        counts={categoryCounts}
        verifiedOnly={verifiedOnly}
        dark={dark}
        onChange={setCategories}
        onVerifiedOnly={setVerifiedOnly}
        sheet={compact}
        source={source}
        sourceCounts={sourceCounts}
        onSource={setSource}
      />
    </div>
  );

  const tabBar = (
    <div className="segmented segmented--full panel-tabs" role="tablist" aria-label="Panel view">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls="panel-body"
          className={tab === t.id ? 'is-on' : ''}
          onClick={() => {
            setTab(t.id);
            setSelectedId(null);
          }}
        >
          <Icon name={t.icon} size={15} filled={t.id === 'saved' && tab === 'saved'} />
          {t.label}
          {t.id === 'saved' && saved.length > 0 && <span className="tab-count tabular">{saved.length}</span>}
        </button>
      ))}
    </div>
  );

  const compactHeader = compact || short;
  const header = (
    <div className="panel-head">
      {compactHeader ? (
        <div className="brand-row brand-row--compact">
          <RegionButton region={region} counts={regionCounts} onChange={changeRegion} />
          <span className="brand-actions">
            {statusPill}
            {hidePanelButton}
          </span>
        </div>
      ) : (
        <>
          <div className="brand-row">
            <span className="wordmark">
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M10 2.5v15M2.5 10h15" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              Meridian
            </span>
            <span className="brand-actions">
              {statusPill}
              {hidePanelButton}
            </span>
          </div>
          <RegionButton region={region} counts={regionCounts} onChange={changeRegion} />
        </>
      )}
      {summaryLine}
      {searchRow}
      {tabBar}
    </div>
  );

  const ribbon = (
    <TimeRibbon
      events={forRibbon}
      range={range}
      brush={brush}
      now={now}
      onRange={setRange}
      onBrush={setBrush}
      compact={compact || short}
    />
  );

  const errorBanner = status === 'error' && (
    <div className="banner" role="alert">
      <div>
        <strong>Can’t reach the event feed</strong>
        <span>{error} Check your connection, then try again.</span>
      </div>
      <button className="pill-button" onClick={retry}>
        Try Again
      </button>
    </div>
  );

  const skeleton = (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <span className="sk-dot" />
          <span className="sk-lines">
            <span />
            <span />
          </span>
        </div>
      ))}
    </div>
  );

  const tabContent =
    tab === 'saved' ? (
      <>
        {saved.length > 0 && (
          <div className="list-toolbar">
            <span className="tabular">
              {saved.length} saved {saved.length === 1 ? 'event' : 'events'}
            </span>
            <button className="text-button" onClick={() => setSaved([])}>
              Clear All
            </button>
          </div>
        )}
        <EventList
          events={savedEvents}
          selectedId={selectedId}
          freshIds={freshIds}
          now={now}
          dark={dark}
          onSelect={select}
          onHover={setHoveredId}
          savedIds={savedIds}
          blurMedia={layers.blurMedia ?? true}
          empty={{
            icon: 'bookmark',
            title: 'No saved events',
            body: 'Open an event and choose Save to keep it here. Saved events stay on this device.',
          }}
        />
      </>
    ) : status === 'loading' ? (
      skeleton
    ) : tab === 'insights' ? (
      <Insights
        events={visible}
        dark={dark}
        onOnlyCategory={(id) => {
          setCategories(new Set([id]));
          setTab('events');
        }}
        onPlace={(e) => {
          setQuery(e.location.name);
          setTab('events');
          mapRef.current?.flyTo(e.location.lng, e.location.lat);
        }}
      />
    ) : (
      <EventList
        events={visible}
        selectedId={selectedId}
        freshIds={freshIds}
        now={now}
        dark={dark}
        onSelect={select}
        onHover={setHoveredId}
        savedIds={savedIds}
        blurMedia={layers.blurMedia ?? true}
        emptyAction={{ label: 'Reset Filters', run: resetFilters }}
      />
    );

  const detail = selected && (
    <EventDetail
      event={selected}
      position={{ index: selectedIndex, total: stepList.length }}
      nearby={nearby}
      now={now}
      dark={dark}
      shareUrl={eventUrl(region, selected.id)}
      onClose={() => select(null)}
      onPrev={() => step(-1)}
      onNext={() => step(1)}
      onSelect={select}
      onZoom={() =>
        mapRef.current?.fitBounds([
          selected.location.lng - 0.25,
          selected.location.lat - 0.18,
          selected.location.lng + 0.25,
          selected.location.lat + 0.18,
        ])
      }
      asPage={!wide}
      saved={savedIds.has(selected.id)}
      blurMedia={layers.blurMedia ?? true}
      onToggleSave={() => toggleSave(selected)}
    />
  );

  const footer = (
    <footer className="panel-foot">
      <span className="panel-foot-text">
        <span className="panel-foot-note">
          <strong>{feed.isSample ? 'Sample data.' : `Live from ${feed.name}.`}</strong> {feed.note}
        </span>
        <button className="link-button" onClick={() => setAboutOpen(true)}>
          Disclaimer &amp; sources · non-commercial project
        </button>
      </span>
      {!compact && (
        <button className="kbd-hint" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)">
          <Icon name="keyboard" size={16} />
          <span className="sr-only">Keyboard shortcuts</span>
        </button>
      )}
    </footer>
  );

  // In narrower layouts the selected event replaces the panel body.
  const panelBody = !wide && detail ? detail : (
    <>
      {errorBanner}
      {compact && tab === 'events' && ribbon}
      {tabContent}
    </>
  );

  const ribbonDocked = !compact;

  return (
    <div className={`app app--${layout}${short ? ' is-short' : ''}`}>
      <MapView
        ref={mapRef}
        events={visible}
        selectedId={selectedId}
        selected={selected}
        hoveredId={hoveredId}
        dark={dark}
        padding={padding}
        reducedMotion={reducedMotion}
        mode={layers.mode}
        territory={territory}
        showTerritory={layers.showTerritory ?? true}
        onSelect={select}
        onHover={setHoveredId}
      />

      {compact ? (
        <Sheet detent={detent} onDetent={setDetent} header={header} vh={vh}>
          <div id="panel-body" role="tabpanel" aria-labelledby={`tab-${tab}`} className="sheet-content">
            {panelBody}
            {!(detail && !wide) && footer}
          </div>
        </Sheet>
      ) : showPanel ? (
        <aside className="sidebar glass" aria-label="Events" style={{ width: sidebarW }}>
          {header}
          <div className="sidebar-scroll" id="panel-body" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {panelBody}
          </div>
          {footer}
        </aside>
      ) : (
        <div className="panel-pill glass">
          <button className="icon-button" onClick={() => setPanelHidden(false)} aria-label="Show side panel" title="Show panel (\)">
            <Icon name="sidebar" size={18} />
          </button>
          <span className="panel-pill-title">{REGION_BY_ID[region].label}</span>
          <span className="panel-pill-meta tabular">{visible.length}</span>
          {statusPill}
        </div>
      )}

      {inspectorOpen && <div className="inspector glass">{detail}</div>}

      {ribbonDocked && (
        <div
          className="ribbon-dock glass"
          style={{ left: leftInset, right: rightInset + CONTROLS_W }}
        >
          {ribbon}
        </div>
      )}

      <div
        className="map-controls glass"
        style={compact ? { bottom: detentHeight(detent, vh) + 12 } : { right: rightInset }}
      >
        <LayersButton value={layers} onChange={setLayers} sheet={compact} territory={territory} />
        <span className="divider" aria-hidden="true" />
        <button className="icon-button" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">
          <Icon name="plus" size={18} />
        </button>
        <span className="divider" aria-hidden="true" />
        <button className="icon-button" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">
          <Icon name="minus" size={18} />
        </button>
        <span className="divider" aria-hidden="true" />
        <button
          className="icon-button"
          onClick={() => mapRef.current?.fitBounds(REGION_BY_ID[region].bounds)}
          aria-label={`Show all of ${REGION_BY_ID[region].label}`}
          title="Fit region"
        >
          <Icon name="globe" size={18} />
        </button>
      </div>

      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={closeAbout} />
    </div>
  );
}
