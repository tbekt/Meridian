import { useRef, useState, type ReactNode } from 'react';

export type Detent = 'peek' | 'half' | 'full';

export function detentHeight(d: Detent, vh: number): number {
  if (d === 'peek') return 136;
  if (d === 'half') return Math.round(vh * 0.5);
  return vh - 64;
}

interface Props {
  detent: Detent;
  onDetent(d: Detent): void;
  header: ReactNode;
  children: ReactNode;
  vh: number;
}

/** Bottom sheet with three detents; drag the grabber or tap it to cycle. */
export function Sheet({ detent, onDetent, header, children, vh }: Props) {
  const [dragY, setDragY] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const base = detentHeight(detent, vh);
  const height = dragY ?? base;

  const settle = (h: number) => {
    const options: Detent[] = ['peek', 'half', 'full'];
    let best: Detent = 'peek';
    let bestDist = Infinity;
    for (const d of options) {
      const dist = Math.abs(detentHeight(d, vh) - h);
      if (dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    onDetent(best);
  };

  const cycle = () => onDetent(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek');

  return (
    <div
      className={`sheet glass${dragY !== null ? ' is-dragging' : ''}`}
      style={{ height }}
      data-detent={detent}
    >
      <div
        className="sheet-handle"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button:not(.grabber), input, a')) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          start.current = { y: e.clientY, h: base, moved: false };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dy = s.y - e.clientY;
          if (Math.abs(dy) > 4) s.moved = true;
          if (s.moved) setDragY(Math.max(120, Math.min(vh - 40, s.h + dy)));
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (s?.moved && dragY !== null) {
            settle(dragY);
            suppressClick.current = (e.target as HTMLElement).classList.contains('grabber');
          }
          setDragY(null);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragY(null);
        }}
      >
        <button
          className="grabber"
          aria-label={`Resize panel, currently ${detent === 'peek' ? 'collapsed' : detent === 'half' ? 'half height' : 'expanded'}`}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            cycle();
          }}
        />
        {header}
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
