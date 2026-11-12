import { useEffect, useState } from 'react';

/**
 * useState that survives reloads via localStorage. Storage can be unavailable
 * (private mode, blocked site data), so every access is guarded and the app
 * falls back to the in-memory default.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`meridian:${key}`);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`meridian:${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable — keep working in memory */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
