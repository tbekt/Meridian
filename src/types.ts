/**
 * Core data model. Any real feed (REST, WebSocket, RSS adapter…) only needs
 * to produce objects of this shape — see src/data/feed.ts.
 */

export type CategoryId =
  | 'airstrike'
  | 'missile'
  | 'drone'
  | 'shelling'
  | 'explosion'
  | 'clashes'
  | 'airdefense'
  | 'movement'
  | 'naval'
  | 'infrastructure'
  | 'humanitarian'
  | 'politics'
  | 'protest';

export type RegionId = 'world' | 'ukraine' | 'israel-palestine' | 'europe' | 'middle-east' | 'africa' | 'asia-pacific' | 'americas';

/** Region an event belongs to; 'other' is only visible under World. */
export type EventRegion = Exclude<RegionId, 'world'> | 'other';

export type SourceKind = 'media' | 'official' | 'social' | 'agency' | 'ngo' | 'telegram' | 'x';

export interface EventMedia {
  type: 'photo' | 'video';
  /** playable/viewable URL (empty when only the original post can show it) */
  url: string;
  /** preview image */
  thumb?: string;
  playable: boolean;
}

export interface EventSource {
  name: string;
  url: string;
  kind: SourceKind;
}

export interface EventLocation {
  name: string;
  /** Oblast, governorate, state… */
  admin?: string;
  country: string;
  lat: number;
  lng: number;
  /** 'approximate' = only a country or province was named (marker sits near its centre) */
  precision?: 'exact' | 'approximate';
}

export interface MapEvent {
  id: string;
  title: string;
  summary?: string;
  category: CategoryId;
  region: EventRegion;
  /**
   * The war this report belongs to when it is located somewhere else (a statement
   * from Abu Dhabi about Ukraine): it also shows on that war's tab.
   */
  topic?: RegionId;
  location: EventLocation;
  /** ISO 8601 timestamp */
  time: string;
  sources: EventSource[];
  /** Corroborated by more than one independent source */
  verified: boolean;
  /** Source text when the event was translated (title/summary are English) */
  original?: { text: string; lang: string };
  /** Translation engine that produced title/summary */
  translatedBy?: 'claude' | 'local';
  /** Photos and videos attached to the original post */
  media?: EventMedia[];
  /** Which pipeline produced the event */
  origin?: 'gdelt' | 'telegram' | 'x' | 'web' | 'sample';
  /** Where the data came from, e.g. how the location was derived */
  provenance?: string;
}

/** Occupied / contested areas, as served by /api/territory. */
export interface TerritoryData {
  region: 'ukraine' | 'israel-palestine';
  /** when the assessment was published (ms) */
  updated: number;
  source: { name: string; url: string };
  /** what the red areas are, for the legend */
  description: string;
  /** fixed boundaries rather than a live front line */
  static?: boolean;
  geojson: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { status: 'occupied' | 'contested' | 'israeli' | 'outline'; name?: string }>;
}

/** Regions with a territorial-control layer. */
export const TERRITORY_REGIONS = ['ukraine', 'israel-palestine'] as const;

export type TimeRange = '6h' | '24h' | '3d' | '7d';

export interface TimeWindow {
  /** epoch ms */
  start: number;
  end: number;
}
