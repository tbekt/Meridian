import type { RegionId } from '../types';
import { REGION_BY_ID } from '../data/regions';

/** URL shape: #/<region>[/<eventId>] — shareable deep links. */
export interface HashState {
  region: RegionId;
  eventId: string | null;
}

export function readHash(): HashState {
  const [, region, eventId] = window.location.hash.replace(/^#/, '').split('/');
  return {
    region: region && region in REGION_BY_ID ? (region as RegionId) : 'world',
    eventId: eventId ? decodeURIComponent(eventId) : null,
  };
}

export function writeHash(state: HashState) {
  const next = `#/${state.region}${state.eventId ? `/${encodeURIComponent(state.eventId)}` : ''}`;
  if (window.location.hash !== next) history.replaceState(null, '', next);
}

export function eventUrl(region: RegionId, eventId: string) {
  const u = new URL(window.location.href);
  u.hash = `/${region}/${encodeURIComponent(eventId)}`;
  return u.toString();
}
