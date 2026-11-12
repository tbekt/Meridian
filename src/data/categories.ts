import type { CategoryId } from '../types';

export interface Category {
  id: CategoryId;
  label: string;
  /** Light / dark appearance fills, based on Apple system colors */
  color: { light: string; dark: string };
  /** Glyph colour drawn on top of the fill — chosen per fill for ≥3:1 */
  ink: { light: string; dark: string };
  /** Inner SVG markup on a 24×24 grid. Uses currentColor. */
  glyph: string;
}

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

const WHITE = { light: '#ffffff', dark: '#ffffff' };
const INK = { light: '#1d1d1f', dark: '#1d1d1f' };

export const CATEGORIES: Category[] = [
  {
    id: 'airstrike',
    label: 'Airstrike',
    color: { light: '#FF3B30', dark: '#FF453A' },
    ink: WHITE,
    glyph: `<path ${F} d="M12 2.5c.8 0 1.4.7 1.4 1.6v5.1l7.1 4.3v1.9l-7.1-2.1v4.4l2.1 1.6v1.8L12 20.1l-3.5 1v-1.8l2.1-1.6v-4.4l-7.1 2.1v-1.9l7.1-4.3V4.1c0-.9.6-1.6 1.4-1.6z"/>`,
  },
  {
    id: 'missile',
    label: 'Missile',
    color: { light: '#FF2D55', dark: '#FF375F' },
    ink: WHITE,
    glyph: `<path ${F} d="M20 4c-3.6 0-6.8 1.8-9 4.8L7.2 9.3 4.6 11.9l3.5 1 3 3 1 3.5 2.6-2.6.5-3.8C18.2 10.8 20 7.6 20 4z"/><path ${S} d="M7.5 16.5 4 20"/>`,
  },
  {
    id: 'drone',
    label: 'Drone',
    color: { light: '#3A3A3C', dark: '#E5E5EA' },
    ink: { light: '#ffffff', dark: '#1d1d1f' },
    glyph: `<path ${S} d="M9.5 9.5 7 7m7.5 2.5L17 7m-7.5 7.5L7 17m7.5-2.5L17 17"/><circle ${S} cx="5.5" cy="5.5" r="2.5"/><circle ${S} cx="18.5" cy="5.5" r="2.5"/><circle ${S} cx="5.5" cy="18.5" r="2.5"/><circle ${S} cx="18.5" cy="18.5" r="2.5"/><rect ${F} x="9" y="9" width="6" height="6" rx="1.5"/>`,
  },
  {
    id: 'shelling',
    label: 'Shelling',
    color: { light: '#A2845E', dark: '#AC8E68' },
    ink: WHITE,
    glyph: `<circle ${S} cx="12" cy="12" r="7"/><path ${S} d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle ${F} cx="12" cy="12" r="2"/>`,
  },
  {
    id: 'explosion',
    label: 'Explosion',
    color: { light: '#FFCC00', dark: '#FFD60A' },
    ink: INK,
    glyph: `<path ${F} d="m12 2 1.9 5.2 5-2.4-2.4 5L22 12l-5.5 1.8 2.4 5-5-2.4L12 22l-1.9-5.6-5 2.4 2.4-5L2 12l5.5-2.2-2.4-5 5 2.4z"/>`,
  },
  {
    id: 'clashes',
    label: 'Clashes',
    color: { light: '#AF52DE', dark: '#BF5AF2' },
    ink: WHITE,
    glyph: `<path ${S} d="M4 4l11 11M20 4 9 15M13 17l4-4M7 13l4 4M16.5 16.5 20 20M7.5 16.5 4 20"/>`,
  },
  {
    id: 'airdefense',
    label: 'Air defense',
    color: { light: '#30B0C7', dark: '#40C8E0' },
    ink: INK,
    glyph: `<path ${S} d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path ${S} d="m9 13.5 3-3 3 3"/>`,
  },
  {
    id: 'movement',
    label: 'Military movement',
    color: { light: '#5856D6', dark: '#5E5CE6' },
    ink: WHITE,
    glyph: `<path ${S} d="m5 6 6 6-6 6M12 6l6 6-6 6"/>`,
  },
  {
    id: 'naval',
    label: 'Naval',
    color: { light: '#007AFF', dark: '#0A84FF' },
    ink: WHITE,
    glyph: `<circle ${S} cx="12" cy="5" r="2"/><path ${S} d="M12 7v14M5 13a7 7 0 0 0 14 0M8.5 10.5h7"/>`,
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    color: { light: '#FF9500', dark: '#FF9F0A' },
    ink: INK,
    glyph: `<path ${F} d="M13.5 2 4.5 13.5h6.5L10 22l9.5-12H13z"/>`,
  },
  {
    id: 'humanitarian',
    label: 'Humanitarian',
    color: { light: '#34C759', dark: '#30D158' },
    ink: INK,
    glyph: `<path ${F} d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>`,
  },
  {
    id: 'politics',
    label: 'Politics',
    color: { light: '#8E8E93', dark: '#98989D' },
    ink: WHITE,
    glyph: `<path ${S} d="m3 9 9-5 9 5M5.5 11v6.5M10 11v6.5M14 11v6.5M18.5 11v6.5M3 20.5h18"/>`,
  },
  {
    id: 'protest',
    label: 'Protest',
    color: { light: '#00C7BE', dark: '#63E6E2' },
    ink: INK,
    glyph: `<path ${S} d="M4 10v4h3l8 4.5V5.5L7 10zM18.5 9a4 4 0 0 1 0 6"/>`,
  },
];

export const CATEGORY_BY_ID: Record<CategoryId, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, Category>;

export const ALL_CATEGORY_IDS = CATEGORIES.map((c) => c.id);
