import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
  type PaddingOptions,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre builds its worker URL at runtime, which bundlers can't follow —
// hand it an explicit, bundler-managed asset URL instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { CATEGORIES, CATEGORY_BY_ID } from '../data/categories';
import { glyphSvg } from './Glyph';
import type { MapEvent, TerritoryData } from '../types';

const STYLE = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

const RECENT_MS = 45 * 60_000;

maplibregl.setWorkerUrl(workerUrl);

export interface MapHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitBounds(bounds: LngLatBoundsLike): void;
  /** Pan to a point without changing selection (used by "Follow new events"). */
  flyTo(lng: number, lat: number): void;
}

export type MapMode = 'markers' | 'heatmap';
const POINT_LAYERS = ['events', 'events-raw'];
const MARKER_LAYERS = ['clusters-halo', 'clusters', 'cluster-count', 'recent-halo', 'event-focus', 'events'];

interface Props {
  events: MapEvent[];
  selectedId: string | null;
  /** resolved selected event — may be outside the current filters */
  selected: MapEvent | null;
  hoveredId: string | null;
  dark: boolean;
  padding: PaddingOptions;
  reducedMotion: boolean;
  mode: MapMode;
  /** occupied / contested areas, drawn under the events */
  territory: TerritoryData | null;
  showTerritory: boolean;
  onSelect(id: string | null): void;
  onHover(id: string | null): void;
}

// ── Marker images ────────────────────────────────────────────────────────────
const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadMarker(category: string, dark: boolean) {
  const key = `${category}-${dark ? 'd' : 'l'}`;
  let p = imageCache.get(key);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image(80, 80);
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(glyphSvg(category as never, dark))}`;
    });
    imageCache.set(key, p);
  }
  return p;
}

function toGeoJSON(events: MapEvent[], now: number): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.location.lng, e.location.lat] },
      properties: {
        id: e.id,
        title: e.title,
        place: e.location.name,
        category: e.category,
        approx: e.location.precision === 'approximate',
        recent: now - +new Date(e.time) < RECENT_MS,
        // newer events draw on top
        sort: +new Date(e.time),
      },
    })),
  };
}

export const MapView = forwardRef<MapHandle, Props>(function MapView(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const readyRef = useRef(false);

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    fitBounds: (b) => {
      const map = mapRef.current;
      if (!map) return;
      const c = map.getContainer();
      map.stop();
      map.setPadding(safePadding(propsRef.current.padding, c.clientWidth, c.clientHeight));
      // transform padding (set from the panel layout) is added by MapLibre
      const cam = map.cameraForBounds(b, { padding: 24 });
      if (!cam) return;
      map.easeTo({
        center: cam.center,
        zoom: Math.max(1.2, cam.zoom ?? 2),
        duration: propsRef.current.reducedMotion ? 0 : 900,
      });
    },
    flyTo: (lng, lat) => {
      const map = mapRef.current;
      if (!map) return;
      const opts = { center: [lng, lat] as [number, number], zoom: Math.max(map.getZoom(), 5.5) };
      if (propsRef.current.reducedMotion) map.jumpTo(opts);
      else map.flyTo({ ...opts, duration: 1400, essential: false });
    },
  }));

  // Create the map once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: props.dark ? STYLE.dark : STYLE.light,
      center: [30, 35],
      zoom: 2.2,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    map.touchZoomRotate.disableRotation();
    // CARTO and OpenStreetMap ask for a visible credit: expanded on wide screens
    // (MapLibre collapses it to an ⓘ button on narrow ones by itself)
    map.addControl(
      new maplibregl.AttributionControl({
        customAttribution:
          'Events: <a href="https://www.gdeltproject.org" target="_blank" rel="noopener">GDELT</a>, Telegram, news sites · Places: <a href="https://www.geonames.org" target="_blank" rel="noopener">GeoNames</a>',
      }),
      'top-right',
    );
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = map;
    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 18,
      className: 'map-tip',
      maxWidth: '260px',
    });

    map.on('style.load', () => installLayers(map));

    // Interaction
    map.on('click', POINT_LAYERS, (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) propsRef.current.onSelect(id);
    });
    map.on('click', 'clusters', async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const src = map.getSource('events') as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
      map.easeTo({
        center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
        zoom: zoom + 0.25,
        duration: propsRef.current.reducedMotion ? 0 : 500,
      });
    });
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      const layers = [...POINT_LAYERS, 'clusters'].filter((l) => map.getLayer(l));
      const hits = map.queryRenderedFeatures(e.point, { layers });
      if (!hits.length) propsRef.current.onSelect(null);
    });
    map.on('mousemove', POINT_LAYERS, (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      const p = f.properties as { id: string; title: string; place: string; category: string };
      if (propsRef.current.hoveredId !== p.id) propsRef.current.onHover(p.id);
      const label = CATEGORY_BY_ID[p.category as MapEvent['category']]?.label ?? '';
      const el = document.createElement('div');
      const meta = document.createElement('div');
      meta.className = 'map-tip-meta';
      meta.textContent = `${label} · ${p.place}`;
      const title = document.createElement('div');
      title.className = 'map-tip-title';
      title.textContent = p.title;
      el.append(meta, title);
      popupRef.current!
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setDOMContent(el)
        .addTo(map);
    });
    map.on('mouseleave', POINT_LAYERS, () => {
      map.getCanvas().style.cursor = '';
      popupRef.current?.remove();
      propsRef.current.onHover(null);
    });
    map.on('mouseenter', 'clusters', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'clusters', () => (map.getCanvas().style.cursor = ''));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme: swap basemap; layers are re-installed on style.load.
  const firstTheme = useRef(true);
  useEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    readyRef.current = false;
    mapRef.current?.setStyle(props.dark ? STYLE.dark : STYLE.light, { diff: false });
  }, [props.dark]);

  // Keep the map's visual centre clear of the floating panels.
  const padKey = JSON.stringify(props.padding);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getContainer();
    map.easeTo({
      padding: safePadding(props.padding, c.clientWidth, c.clientHeight),
      duration: props.reducedMotion ? 0 : 320,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padKey]);

  // Data — the clustered source drives markers, the raw one drives the heatmap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const data = toGeoJSON(props.events, Date.now());
    (map.getSource('events') as GeoJSONSource | undefined)?.setData(data);
    (map.getSource('events-raw') as GeoJSONSource | undefined)?.setData(data);
  }, [props.events]);

  // Territorial control
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (props.territory) installTerritory(map, props.territory, propsRef.current.dark);
    setTerritoryVisible(map, props.showTerritory && !!props.territory);
  }, [props.territory, props.showTerritory]);

  // Markers ↔ heatmap
  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) applyMode(map, props.mode);
  }, [props.mode]);

  // Selection + hover ring
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    applyFocus(map, props.selectedId, props.hoveredId);
  }, [props.selectedId, props.hoveredId]);

  // Fly to newly selected events (also once a deep-linked event finishes loading)
  const flownTo = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!props.selectedId) flownTo.current = null;
    if (!map || !props.selectedId || flownTo.current === props.selectedId) return;
    const e = props.selected;
    if (!e) return;
    flownTo.current = e.id;
    const target: [number, number] = [e.location.lng, e.location.lat];
    const opts = {
      center: target,
      zoom: Math.max(map.getZoom(), 8),
      duration: props.reducedMotion ? 0 : 1100,
      essential: false,
    };
    if (props.reducedMotion) map.jumpTo(opts);
    else map.flyTo({ ...opts, curve: 1.3 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId, props.selected]);

  async function installLayers(map: maplibregl.Map) {
    const { dark } = propsRef.current;
    const imgs = await Promise.all(CATEGORIES.map((c) => loadMarker(c.id, dark)));
    if (map !== mapRef.current) return;
    CATEGORIES.forEach((c, i) => {
      const name = `cat-${c.id}`;
      if (map.hasImage(name)) map.removeImage(name);
      map.addImage(name, imgs[i], { pixelRatio: 2 });
    });

    if (propsRef.current.territory) {
      installTerritory(map, propsRef.current.territory, dark);
      setTerritoryVisible(map, propsRef.current.showTerritory);
    } else {
      setTerritoryVisible(map, false);
    }

    if (map.getSource('events')) return;
    map.addSource('events', {
      type: 'geojson',
      data: toGeoJSON(propsRef.current.events, Date.now()),
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 6,
    });

    const colorExpr = [
      'match',
      ['get', 'category'],
      ...CATEGORIES.flatMap((c) => [c.id, c.color[dark ? 'dark' : 'light']]),
      '#8E8E93',
    ] as unknown as maplibregl.ExpressionSpecification;

    const clusterFill = dark ? 'rgba(242,242,247,0.92)' : 'rgba(29,29,31,0.88)';
    const clusterInk = dark ? '#1c1c1e' : '#ffffff';
    const ring = dark ? 'rgba(28,28,30,0.9)' : 'rgba(255,255,255,0.95)';

    map.addLayer({
      id: 'clusters-halo',
      type: 'circle',
      source: 'events',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': clusterFill,
        'circle-opacity': 0.18,
        'circle-radius': ['step', ['get', 'point_count'], 22, 10, 27, 40, 34],
      },
    });
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'events',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': clusterFill,
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 40, 24],
        'circle-stroke-width': 2,
        'circle-stroke-color': ring,
      },
    });
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'events',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Montserrat SemiBold', 'Open Sans Bold'],
        'text-size': 12.5,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': clusterInk },
    });
    map.addLayer({
      id: 'recent-halo',
      type: 'circle',
      source: 'events',
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'recent'], true]],
      paint: {
        'circle-color': colorExpr,
        'circle-opacity': 0.22,
        'circle-radius': 21,
        'circle-blur': 0.35,
      },
    });
    map.addLayer({
      id: 'event-focus',
      type: 'circle',
      source: 'events',
      filter: ['==', ['get', 'id'], '__none__'],
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        'circle-radius': 19,
        'circle-stroke-width': 3,
        'circle-stroke-color': colorExpr,
      },
    });
    map.addLayer({
      id: 'events',
      type: 'symbol',
      source: 'events',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['concat', 'cat-', ['get', 'category']],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'sort'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 1],
      },
      // approximate (country/province-level) locations are drawn fainter
      paint: { 'icon-opacity': ['case', ['==', ['get', 'approx'], true], 0.55, 1] },
    });
    // Heatmap: density of reports, fading into individual markers when zoomed in
    const rawData = toGeoJSON(propsRef.current.events, Date.now());
    map.addSource('events-raw', { type: 'geojson', data: rawData });
    map.addLayer(
      {
        id: 'heat',
        type: 'heatmap',
        source: 'events-raw',
        maxzoom: 9,
        paint: {
          'heatmap-weight': ['case', ['==', ['get', 'approx'], true], 0.4, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 9, 2.2],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 12, 5, 26, 9, 40],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.85, 9, 0.25],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(255,204,0,0)',
            0.15, 'rgba(255,204,0,0.45)',
            0.4, 'rgba(255,149,0,0.7)',
            0.7, 'rgba(255,59,48,0.85)',
            1, 'rgba(255,45,85,0.95)',
          ],
        },
      },
      'clusters-halo',
    );
    map.addLayer({
      id: 'events-raw',
      type: 'symbol',
      source: 'events-raw',
      minzoom: 6,
      layout: {
        'icon-image': ['concat', 'cat-', ['get', 'category']],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'sort'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 9, 1],
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7, 1] },
    });
    applyMode(map, propsRef.current.mode);

    readyRef.current = true;
    applyFocus(map, propsRef.current.selectedId, propsRef.current.hoveredId);
  }

  return <div ref={container} className="map" role="region" aria-label="Event map" />;
});

const TERRITORY_LAYERS = ['territory-fill', 'territory-line', 'territory-label'];

/**
 * Russian-occupied areas in red, the contested "grey zone" in grey and
 * Israeli-held areas in blue, like the familiar front-line maps; "outline"
 * features (the Gaza Strip as a whole) get a border but no fill. Drawn above the basemap's land and roads but below its
 * place labels, so town names stay readable.
 */
function installTerritory(map: maplibregl.Map, t: TerritoryData, dark: boolean) {
  const existing = map.getSource('territory') as (GeoJSONSource & { _territorySource?: string }) | undefined;
  if (existing && existing._territorySource === t.source.name) {
    existing.setData(t.geojson);
    return;
  }
  // a different source (switching between regions): rebuild so the attribution follows
  if (existing) {
    for (const id of TERRITORY_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
    map.removeSource('territory');
  }
  map.addSource('territory', {
    type: 'geojson',
    data: t.geojson,
    attribution: `Territory: <a href="${t.source.url}" target="_blank" rel="noopener">${t.source.name}</a>`,
  });
  (map.getSource('territory') as GeoJSONSource & { _territorySource?: string })._territorySource = t.source.name;
  const firstLabel = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
  const red = dark ? '#FF453A' : '#FF3B30';
  const blue = dark ? '#6E7BFF' : '#3347E0';
  const grey = '#8E8E93';
  const byStatus = (occupied: string | number, israeli: string | number, outline: string | number, other: string | number) =>
    ['match', ['get', 'status'], 'occupied', occupied, 'israeli', israeli, 'outline', outline, other] as unknown as maplibregl.ExpressionSpecification;
  map.addLayer(
    {
      id: 'territory-fill',
      type: 'fill',
      source: 'territory',
      paint: {
        'fill-color': byStatus(red, blue, blue, grey),
        'fill-opacity': byStatus(dark ? 0.2 : 0.16, dark ? 0.26 : 0.2, 0, dark ? 0.28 : 0.22),
      },
    },
    firstLabel,
  );
  map.addLayer(
    {
      id: 'territory-line',
      type: 'line',
      source: 'territory',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': byStatus(red, blue, blue, grey),
        'line-opacity': byStatus(0.85, 0.9, 0.55, 0.7),
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 7, 1.4, 11, 2.4],
      },
    },
    firstLabel,
  );
  // names of occupied units ("West Bank", "Golan Heights") where the source has them
  map.addLayer({
    id: 'territory-label',
    type: 'symbol',
    source: 'territory',
    minzoom: 6,
    filter: ['has', 'name'],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Montserrat SemiBold', 'Open Sans Bold'],
      'text-size': 11,
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.08,
      'symbol-placement': 'point',
    },
    paint: {
      'text-color': byStatus(red, blue, blue, grey),
      'text-halo-color': dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)',
      'text-halo-width': 1.4,
    },
  });
}

function setTerritoryVisible(map: maplibregl.Map, visible: boolean) {
  for (const id of TERRITORY_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

function applyMode(map: maplibregl.Map, mode: MapMode) {
  const heat = mode === 'heatmap';
  for (const id of MARKER_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', heat ? 'none' : 'visible');
  for (const id of ['heat', 'events-raw']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', heat ? 'visible' : 'none');
}

function applyFocus(map: maplibregl.Map, selected: string | null, hovered: string | null) {
  if (!map.getLayer('event-focus')) return;
  const ids = [selected, hovered].filter(Boolean) as string[];
  map.setFilter('event-focus', ['in', ['get', 'id'], ['literal', ids.length ? ids : ['__none__']]]);
}

/** Never let floating panels squeeze the visible map below 40% of each axis. */
function safePadding(p: PaddingOptions, w: number, h: number): PaddingOptions {
  const fit = (a: number, b: number, size: number) => {
    const max = size * 0.6;
    const k = a + b > max ? max / (a + b) : 1;
    return [a * k, b * k];
  };
  const [left, right] = fit(p.left ?? 0, p.right ?? 0, w);
  const [top, bottom] = fit(p.top ?? 0, p.bottom ?? 0, h);
  return { left, right, top, bottom };
}

