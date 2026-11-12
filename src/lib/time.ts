import type { TimeRange } from '../types';

export const RANGE_MS: Record<TimeRange, number> = {
  '6h': 6 * 3_600_000,
  '24h': 24 * 3_600_000,
  '3d': 72 * 3_600_000,
  '7d': 168 * 3_600_000,
};

export const RANGE_LABEL: Record<TimeRange, string> = {
  '6h': '6H',
  '24h': '24H',
  '3d': '3D',
  '7d': '7D',
};

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });

export function relativeTime(iso: string | number, now: number): string {
  const diff = (typeof iso === 'number' ? iso : +new Date(iso)) - now;
  const s = Math.round(diff / 1000);
  if (s > -45) return 'Just now';
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rtf.format(m, 'minute');
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

export function clockTime(iso: string | number): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function fullDate(iso: string | number): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Feed section heading for a timestamp. */
export function dayBucket(iso: string, now: number): string {
  const t = new Date(iso);
  const age = now - +t;
  if (age < 3_600_000) return 'Last hour';
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (+t >= +today) return 'Earlier today';
  const yesterday = new Date(+today - 86_400_000);
  if (+t >= +yesterday) return 'Yesterday';
  return t.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
