/** Small UI symbol set (SF Symbols-like weights), 20×20 grid. */
const PATHS = {
  search: 'M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM13 13l3.5 3.5',
  filter: 'M3.5 6h13M6 10h8M8.5 14h3',
  close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  chevronDown: 'M6 8l4 4 4-4',
  chevronUp: 'M6 12l4-4 4 4',
  chevronLeft: 'M12 5l-5 5 5 5',
  chevronRight: 'M8 5l5 5-5 5',
  plus: 'M10 4.5v11M4.5 10h11',
  minus: 'M4.5 10h11',
  link: 'M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9',
  external: 'M11 4.5h4.5V9M15.5 4.5 9 11M13.5 12v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3',
  target: 'M10 3v2.5M10 14.5V17M3 10h2.5M14.5 10H17M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  globe: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM3 10h14M10 3c-2 2-2.8 4.4-2.8 7s.8 5 2.8 7c2-2 2.8-4.4 2.8-7S12 5 10 3z',
  check: 'M5 10.5l3 3 7-7',
  seal: 'M10 2.8l1.6 1.2 2-.2.8 1.8 1.8.8-.2 2 1.2 1.6-1.2 1.6.2 2-1.8.8-.8 1.8-2-.2L10 17.2l-1.6-1.2-2 .2-.8-1.8-1.8-.8.2-2L2.8 10 4 8.4l-.2-2 1.8-.8.8-1.8 2 .2zM7.3 10.2l1.8 1.8 3.6-3.6',
  pin: 'M10 17s5-4.6 5-8.5a5 5 0 0 0-10 0C5 12.4 10 17 10 17zM10 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  clock: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 6v4l2.5 2',
  bookmark: 'M6 3.5h8a1 1 0 0 1 1 1v12l-5-3.2-5 3.2v-12a1 1 0 0 1 1-1z',
  share: 'M10 12.5V3M6.5 6.5 10 3l3.5 3.5M6 9H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-1',
  layers: 'M10 3 3 7l7 4 7-4-7-4zM3 10.5l7 4 7-4M3 14l7 4 7-4',
  chart: 'M4 16.5h12M6 13.5v-4M10 13.5v-9M14 13.5v-6',
  list: 'M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.75 5.5h.01M3.75 10h.01M3.75 14.5h.01',
  keyboard: 'M3.5 5.5h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM6 8.5h.01M9 8.5h.01M12 8.5h.01M15 8.5h.01M6.5 11.5h7',
  sidebar: 'M3.5 4h13a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 4v12',
  bell: 'M10 3a4.5 4.5 0 0 0-4.5 4.5c0 4-1.7 5.5-1.7 5.5h12.4s-1.7-1.5-1.7-5.5A4.5 4.5 0 0 0 10 3zM8.5 16a1.6 1.6 0 0 0 3 0',
  follow: 'M16.5 3.5 3.5 9l5.5 2 2 5.5z',
  flame: 'M10 17.5c3 0 5-2.1 5-5 0-3.5-3-5-3-8.5-2 1-3.5 3-3.5 5.5-1-.5-1.5-1.5-1.5-2.5C5.5 8.5 5 10.5 5 12.5c0 2.9 2 5 5 5z',
} as const;

export type IconName = keyof typeof PATHS;

/** Icons drawn filled instead of stroked when `filled` is set. */
export function Icon({ name, size = 20, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
