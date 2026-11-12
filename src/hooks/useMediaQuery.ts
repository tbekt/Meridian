import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useDarkMode = () => useMediaQuery('(prefers-color-scheme: dark)');
export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

/**
 * Layout tiers, chosen by available space rather than device:
 *  - compact: phones in portrait → bottom sheet
 *  - medium:  tablets, small laptops, phones in landscape → sidebar; details open inside it
 *  - wide:    sidebar + separate inspector
 */
export type Layout = 'compact' | 'medium' | 'wide';

export function useLayout(): Layout {
  const compact = useMediaQuery('(max-width: 760px)');
  const wide = useMediaQuery('(min-width: 1200px) and (min-height: 560px)');
  return compact ? 'compact' : wide ? 'wide' : 'medium';
}

/** Short windows (landscape phones, small laptops) move the time ribbon into the panel. */
export const useShortViewport = () => useMediaQuery('(max-height: 620px)');
