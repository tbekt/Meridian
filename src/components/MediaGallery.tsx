import { useEffect, useRef, useState } from 'react';
import type { EventMedia } from '../types';
import { Icon } from './Icon';

interface Props {
  media: EventMedia[];
  /** blur until the viewer chooses to see it (war footage can be graphic) */
  blur: boolean;
  /** the original post, for media that can only be watched there */
  postUrl: string;
  platform: string;
}

/** Photos and videos from the original post. */
export function MediaGallery({ media, blur, postUrl, platform }: Props) {
  const [revealed, setRevealed] = useState(!blur);
  const [viewer, setViewer] = useState<number | null>(null);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const hidden = blur && !revealed;
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;

  useEffect(() => setRevealed(!blur), [blur, media]);

  const open = (i: number) => {
    if (hidden) return setRevealed(true);
    setViewer(i);
  };

  return (
    <div className={`gallery gallery--${Math.min(shown.length, 4)}${hidden ? ' is-hidden' : ''}`}>
      {shown.map((m, i) => {
        const broken = failed.has(i);
        const watchOutside = m.type === 'video' && !m.playable;
        return (
          <div className="gallery-item" key={i}>
            {m.type === 'video' && m.playable && !hidden && !broken ? (
              <video src={m.url} poster={m.thumb} controls preload="none" playsInline />
            ) : broken || (!m.thumb && !m.url) ? (
              <a className="gallery-fallback" href={postUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={18} />
                View on {platform}
              </a>
            ) : (
              <button
                className="gallery-thumb"
                onClick={() => (watchOutside && !hidden ? window.open(postUrl, '_blank', 'noopener') : open(i))}
                aria-label={hidden ? 'Show media' : m.type === 'video' ? 'Play video' : 'View photo'}
              >
                <img
                  src={m.thumb ?? m.url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setFailed((f) => new Set(f).add(i))}
                />
                {m.type === 'video' && !hidden && (
                  <span className="gallery-play" aria-hidden="true">
                    ▶
                  </span>
                )}
                {i === shown.length - 1 && extra > 0 && !hidden && <span className="gallery-more">+{extra}</span>}
              </button>
            )}
          </div>
        );
      })}
      {hidden && (
        <button className="gallery-reveal" onClick={() => setRevealed(true)}>
          <strong>Show media</strong>
          <span>
            {media.length} {media.length === 1 ? 'item' : 'items'} · may contain graphic content
          </span>
        </button>
      )}
      {viewer !== null && (
        <Lightbox media={media} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} postUrl={postUrl} />
      )}
    </div>
  );
}

function Lightbox({
  media,
  index,
  onIndex,
  onClose,
  postUrl,
}: {
  media: EventMedia[];
  index: number;
  onIndex(i: number): void;
  onClose(): void;
  postUrl: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const m = media[index];
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight' && index < media.length - 1) onIndex(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [index, media.length, onClose, onIndex]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Media viewer" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {m.type === 'video' && m.playable ? (
        <video src={m.url} poster={m.thumb} controls autoPlay playsInline />
      ) : (
        <img src={m.url || m.thumb} alt="" referrerPolicy="no-referrer" />
      )}
      <div className="lightbox-bar">
        <button className="icon-button" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous">
          <Icon name="chevronLeft" size={20} />
        </button>
        <span className="tabular">
          {index + 1} / {media.length}
        </span>
        <button className="icon-button" onClick={() => onIndex(index + 1)} disabled={index === media.length - 1} aria-label="Next">
          <Icon name="chevronRight" size={20} />
        </button>
        <a className="icon-button" href={postUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the original post">
          <Icon name="external" size={18} />
        </a>
        <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
      </div>
    </div>
  );
}
