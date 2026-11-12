import { useEffect, useRef, useState } from 'react';
import { CATEGORY_BY_ID } from '../data/categories';
import type { MapEvent, SourceKind } from '../types';
import { fullDate, relativeTime } from '../lib/time';
import { Glyph } from './Glyph';
import { Icon } from './Icon';
import { MediaGallery } from './MediaGallery';

/** The native share sheet is offered on touch devices that support it; desktops get Copy Link. */
const canShare =
  typeof navigator !== 'undefined' && 'share' in navigator && window.matchMedia('(pointer: coarse)').matches;

const LANG_NAME: Record<string, string> = { uk: 'Ukrainian', ru: 'Russian' };

const KIND_LABEL: Record<SourceKind, string> = {
  media: 'News outlet',
  official: 'Official',
  social: 'Social',
  agency: 'News agency',
  ngo: 'NGO',
  telegram: 'Telegram channel',
  x: 'X account',
};

interface Props {
  event: MapEvent;
  position: { index: number; total: number };
  nearby: MapEvent[];
  now: number;
  dark: boolean;
  shareUrl: string;
  onClose(): void;
  onPrev(): void;
  onNext(): void;
  onSelect(id: string): void;
  onZoom(): void;
  /** compact layouts show a Back button instead of Close */
  asPage?: boolean;
  saved: boolean;
  blurMedia?: boolean;
  onToggleSave(): void;
}

export function EventDetail(p: Props) {
  const e = p.event;
  const cat = CATEGORY_BY_ID[e.category];
  const [copied, setCopied] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setCopied(false);
    setShowOriginal(false);
    headingRef.current?.focus({ preventScroll: true });
  }, [e.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', p.shareUrl);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: e.title, text: `${e.title} — ${e.location.name}`, url: p.shareUrl });
    } catch {
      /* dismissed by the user */
    }
  };

  return (
    <article className="detail" aria-labelledby="detail-title">
      <header className="detail-bar">
        {p.asPage ? (
          <button className="back-button" onClick={p.onClose}>
            <Icon name="chevronLeft" size={18} />
            Events
          </button>
        ) : (
          <span className="detail-kicker">
            <Glyph category={e.category} size={22} dark={p.dark} />
            {cat.label}
          </span>
        )}
        <div className="detail-bar-actions">
          <button
            className="icon-button"
            onClick={p.onPrev}
            disabled={p.position.index <= 0}
            aria-label="Newer event"
            title="Newer event (K)"
          >
            <Icon name="chevronUp" size={18} />
          </button>
          <button
            className="icon-button"
            onClick={p.onNext}
            disabled={p.position.index >= p.position.total - 1}
            aria-label="Older event"
            title="Older event (J)"
          >
            <Icon name="chevronDown" size={18} />
          </button>
          {!p.asPage && (
            <button className="icon-button" onClick={p.onClose} aria-label="Close" title="Close (Esc)">
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="detail-scroll">
        {p.asPage && (
          <span className="detail-kicker">
            <Glyph category={e.category} size={22} dark={p.dark} />
            {cat.label}
          </span>
        )}
        <h2 id="detail-title" className="detail-title" tabIndex={-1} ref={headingRef}>
          {e.title}
        </h2>

        {e.media && e.media.length > 0 && (
          <MediaGallery
            media={e.media}
            blur={p.blurMedia ?? true}
            postUrl={e.sources[0]?.url ?? '#'}
            platform={e.origin === 'x' ? 'X' : 'Telegram'}
          />
        )}

        <dl className="facts">
          <div>
            <dt>
              <Icon name="clock" size={16} />
              <span className="sr-only">Time</span>
            </dt>
            <dd>
              <time dateTime={e.time}>{fullDate(e.time)}</time>
              <span className="facts-sub">{relativeTime(e.time, p.now)}</span>
            </dd>
          </div>
          <div>
            <dt>
              <Icon name="pin" size={16} />
              <span className="sr-only">Location</span>
            </dt>
            <dd>
              {e.location.name}
              <span className="facts-sub">
                {e.location.precision === 'approximate' ? (
                  'Approximate location'
                ) : (
                  <>
                    {[e.location.admin, e.location.country].filter(Boolean).join(', ')} ·{' '}
                    <span className="tabular">
                      {e.location.lat.toFixed(3)}, {e.location.lng.toFixed(3)}
                    </span>
                  </>
                )}
              </span>
            </dd>
          </div>
          <div>
            <dt>
              <Icon name="seal" size={16} />
              <span className="sr-only">Corroboration</span>
            </dt>
            <dd>
              {e.origin === 'telegram' ? 'Telegram report' : e.origin === 'x' ? 'X post' : e.verified ? 'Corroborated' : 'Single report'}
              <span className="facts-sub">
                {e.origin === 'telegram' || e.origin === 'x'
                  ? e.sources.length > 1
                    ? 'Post with its original source'
                    : e.origin === 'x'
                      ? 'Account post'
                      : 'Channel post'
                  : `${e.sources.length} ${e.sources.length === 1 ? 'outlet' : 'outlets'}`}
              </span>
            </dd>
          </div>
        </dl>

        {e.original && (
          <div className="translation-note">
            <span>
              {e.translatedBy
                ? `Translated from ${LANG_NAME[e.original.lang] ?? e.original.lang}${e.translatedBy === 'local' ? ' (machine translation)' : ' by Claude'}`
                : `Translation pending · ${LANG_NAME[e.original.lang] ?? e.original.lang}`}
            </span>
            {e.translatedBy && (
              <button className="text-button" onClick={() => setShowOriginal((v) => !v)} aria-expanded={showOriginal}>
                {showOriginal ? 'Hide Original' : 'Show Original'}
              </button>
            )}
          </div>
        )}
        {showOriginal && e.original ? (
          <p className="detail-summary detail-original" lang={e.original.lang}>
            {e.original.text}
          </p>
        ) : (
          e.summary && <p className="detail-summary">{e.summary}</p>
        )}
        {e.provenance && <p className="detail-provenance">{e.provenance}</p>}

        <div className="detail-actions">
          <button
            className={`pill-button${p.saved ? ' is-on' : ''}`}
            onClick={p.onToggleSave}
            aria-pressed={p.saved}
            title="Save (S)"
          >
            <Icon name="bookmark" size={16} filled={p.saved} />
            {p.saved ? 'Saved' : 'Save'}
          </button>
          <button className="pill-button" onClick={p.onZoom}>
            <Icon name="target" size={16} />
            Show on Map
          </button>
          {canShare ? (
            <button className="pill-button" onClick={share}>
              <Icon name="share" size={16} />
              Share
            </button>
          ) : (
            <button className="pill-button" onClick={copy} aria-live="polite">
              <Icon name={copied ? 'check' : 'link'} size={16} />
              {copied ? 'Link Copied' : 'Copy Link'}
            </button>
          )}
        </div>

        <h3 className="detail-section">Sources</h3>
        <ul className="sources" role="list">
          {e.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="source">
                <span className="source-avatar" aria-hidden="true">
                  {s.name
                    .replace(/^www./, '')
                    .split(/[ .]/)
                    .map((w) => w[0])
                    .slice(0, s.name.includes(' ') ? 2 : 1)
                    .join('')
                    .toUpperCase()}
                </span>
                <span className="source-body">
                  <span className="source-name">{s.name}</span>
                  <span className="source-kind">{KIND_LABEL[s.kind]}</span>
                </span>
                <Icon name="external" size={16} />
              </a>
            </li>
          ))}
        </ul>
        <p className="source-note">
          Shown as published by {e.sources.length > 1 ? 'these sources' : 'this source'}; not independently verified.
          {e.media?.length ? ' Photos and videos © their authors.' : ''}
        </p>

        {p.nearby.length > 0 && (
          <>
            <h3 className="detail-section">Nearby</h3>
            <ul className="nearby" role="list">
              {p.nearby.map((n) => (
                <li key={n.id}>
                  <button className="nearby-row" onClick={() => p.onSelect(n.id)}>
                    <Glyph category={n.category} size={22} dark={p.dark} />
                    <span className="nearby-title">{n.title}</span>
                    <time className="nearby-time" dateTime={n.time}>
                      {relativeTime(n.time, p.now)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </article>
  );
}
