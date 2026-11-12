import type { EventRegion, RegionId } from '../types.ts';

export interface Region {
  id: RegionId;
  label: string;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
}

/**
 * Order matters: an event is assigned to the first region whose bounds contain
 * it (see regionFor), so the tighter boxes come first.
 */
export const REGIONS: Region[] = [
  { id: 'world', label: 'World', bounds: [-130, -40, 150, 65] },
  { id: 'ukraine', label: 'Ukraine', bounds: [22.0, 44.2, 40.3, 52.4] },
  // Israel, the West Bank, Gaza and the Golan Heights; before Middle East so it wins
  { id: 'israel-palestine', label: 'Israel–Palestine', bounds: [34.15, 29.45, 35.95, 33.4] },
  { id: 'middle-east', label: 'Middle East', bounds: [32.0, 12.0, 63.0, 38.5] },
  { id: 'europe', label: 'Europe', bounds: [-11.0, 35.0, 40.0, 63.0] },
  { id: 'africa', label: 'Africa', bounds: [-18.0, -35.0, 52.0, 37.0] },
  { id: 'asia-pacific', label: 'Asia-Pacific', bounds: [60.0, -45.0, 180.0, 55.0] },
  { id: 'americas', label: 'Americas', bounds: [-170.0, -56.0, -30.0, 72.0] },
];

export function regionFor(lat: number, lng: number): EventRegion {
  for (const r of REGIONS) {
    if (r.id === 'world') continue;
    const [w, s, e, n] = r.bounds;
    if (lng >= w && lng <= e && lat >= s && lat <= n) return r.id;
  }
  return 'other';
}

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, Region>;
