import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose(): void;
  /** element that toggles the popover — clicks on it are not "outside" */
  anchor: React.RefObject<HTMLElement | null>;
  label: string;
  className?: string;
  /** Render at the document root as a bottom sheet (used on phones, where
   *  blurred ancestors would otherwise clip a fixed-position popover). */
  sheet?: boolean;
  children: ReactNode;
}

/** Lightweight popover: dismisses on Escape or an outside click, returns focus to its anchor. */
export function Popover({ open, onClose, anchor, label, className = '', sheet = false, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = ref.current?.querySelector<HTMLElement>('button, input, [tabindex]');
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  const el = (
    <div ref={ref} className={`popover glass ${className}${sheet ? ' popover--sheet' : ''}`} role="dialog" aria-label={label}>
      {children}
    </div>
  );
  return sheet ? createPortal(el, document.body) : el;
}
