import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

const SHORTCUTS: [string[], string][] = [
  [['J'], 'Next (older) event'],
  [['K'], 'Previous (newer) event'],
  [['/'], 'Search'],
  [['F'], 'Filter categories'],
  [['L'], 'Layers and live options'],
  [['H'], 'Toggle heatmap'],
  [['S'], 'Save or unsave the selected event'],
  [['1', '2', '3'], 'Events, Saved, Insights'],
  [['\\'], 'Show or hide the side panel'],
  [['Esc'], 'Close'],
  [['?'], 'Show this list'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog glass" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <header className="dialog-head">
          <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <dl className="shortcut-list">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
