import { CATEGORY_BY_ID } from '../data/categories';
import type { CategoryId } from '../types';

interface Props {
  category: CategoryId;
  size?: number;
  dark: boolean;
}

/** Category badge: colour + distinct glyph shape, so meaning never rests on colour alone. */
export function Glyph({ category, size = 28, dark }: Props) {
  const c = CATEGORY_BY_ID[category];
  const mode = dark ? 'dark' : 'light';
  return (
    <svg
      className="glyph"
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-hidden="true"
      style={{ color: c.ink[mode] }}
    >
      <circle cx="14" cy="14" r="14" fill={c.color[mode]} />
      <g transform="translate(6.5 6.5) scale(0.625)" dangerouslySetInnerHTML={{ __html: c.glyph }} />
    </svg>
  );
}

/** Same badge as a standalone SVG string, rasterised for the map. */
export function glyphSvg(category: CategoryId, dark: boolean): string {
  const c = CATEGORY_BY_ID[category];
  const mode = dark ? 'dark' : 'light';
  const ring = dark ? '#1c1c1e' : '#ffffff';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 40 40">
  <defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
  <circle cx="20" cy="21.2" r="13" fill="#000" opacity="${dark ? 0.55 : 0.22}" filter="url(#s)"/>
  <circle cx="20" cy="20" r="13" fill="${c.color[mode]}" stroke="${ring}" stroke-width="2"/>
  <g transform="translate(12.5 12.5) scale(0.625)" color="${c.ink[mode]}" style="color:${c.ink[mode]}">${c.glyph}</g>
</svg>`;
}
