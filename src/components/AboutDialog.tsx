import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface Credit {
  name: string;
  url: string;
  what: string;
  license?: string;
}

/** Where the data, map and tools come from, with the credit each licence asks for. */
const DATA: Credit[] = [
  { name: 'The GDELT Project', url: 'https://www.gdeltproject.org', what: 'News reports from news sites worldwide' },
  { name: 'Telegram channels', url: 'https://telegram.org', what: 'Public channel posts; each event links to its original post and channel' },
  {
    name: 'News sites',
    url: 'https://www.aljazeera.com',
    what: 'Al Jazeera, Alaraby TV, i24NEWS, The Times of Israel, The Jerusalem Post, Middle East Monitor: headlines from their public feeds, linked to the original article',
  },
  { name: 'DeepStateMap', url: 'https://deepstatemap.live', what: 'Occupied and contested areas in Ukraine', license: '© DeepState' },
  { name: 'Natural Earth', url: 'https://www.naturalearthdata.com', what: 'Occupied territories (West Bank, Golan Heights)', license: 'Public domain' },
  { name: 'geoBoundaries', url: 'https://www.geoboundaries.org', what: 'Gaza Strip boundary', license: 'CC BY 4.0' },
  { name: 'GeoNames', url: 'https://www.geonames.org', what: 'Place names used to locate posts', license: 'CC BY 4.0' },
];

const MAP: Credit[] = [
  { name: 'CARTO', url: 'https://carto.com/attributions', what: 'Basemap tiles and styles', license: 'Design CC BY 4.0' },
  { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', what: 'Map data', license: 'ODbL' },
  { name: 'OpenMapTiles', url: 'https://openmaptiles.org', what: 'Vector tile schema' },
  { name: 'MapLibre GL JS', url: 'https://maplibre.org', what: 'Map rendering', license: 'BSD-3-Clause' },
];

const TOOLS: Credit[] = [
  {
    name: 'Helsinki-NLP OPUS-MT',
    url: 'https://huggingface.co/Helsinki-NLP',
    what: 'Machine translation from Ukrainian, Russian and Arabic',
    license: 'Apache 2.0 / CC BY 4.0',
  },
  { name: 'Transformers.js', url: 'https://huggingface.co/docs/transformers.js', what: 'Runs the translation models', license: 'Apache 2.0' },
];

function CreditList({ items }: { items: Credit[] }) {
  return (
    <ul className="credit-list" role="list">
      {items.map((c) => (
        <li key={c.name}>
          <a href={c.url} target="_blank" rel="noopener noreferrer">
            {c.name}
          </a>
          {c.license && <span className="credit-license">{c.license}</span>}
          <span className="credit-what">{c.what}</span>
        </li>
      ))}
    </ul>
  );
}

/** Disclaimer and credits. Opens by itself on the first visit. */
export function AboutDialog({ open, onClose }: { open: boolean; onClose(): void }) {
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
      <div className="dialog dialog--wide glass" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <header className="dialog-head">
          <h2 id="about-title">About Meridian</h2>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>

        <section className="disclaimer" aria-labelledby="disclaimer-title">
          <h3 id="disclaimer-title">Disclaimer</h3>
          <p>
            Meridian is a <strong>personal, non-commercial project</strong>. It has no ads, no paid features and no
            affiliation with any of the sources below.
          </p>
          <ul>
            <li>
              Reports are collected <strong>automatically</strong> from news sites and public Telegram channels and shown as
              published. Nothing is independently verified. Some sources are parties to the conflicts and report
              from their own side.
            </li>
            <li>
              Categories, locations and translations are <strong>machine-made</strong> and can be wrong. Locations marked
              approximate are placed at a country or region.
            </li>
            <li>
              Territorial-control areas are <strong>indicative</strong>. The Israeli-held zone in Gaza is an approximate
              schematic, not survey data.
            </li>
            <li>
              Posts, articles, photos and videos belong to their authors. Every event links to its original source.
              Photos and videos can be graphic and are blurred until you open them.
            </li>
            <li>Do not use this map for safety, travel or military decisions.</li>
          </ul>
          <p className="disclaimer-contact">
            Are you a source owner and want your content removed or credited differently? Open an issue on{' '}
            <a href="https://github.com/tbekt/Meridian/issues" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            .
          </p>
        </section>

        <h3 className="credit-head">Data</h3>
        <CreditList items={DATA} />
        <h3 className="credit-head">Map</h3>
        <CreditList items={MAP} />
        <h3 className="credit-head">Translation</h3>
        <CreditList items={TOOLS} />

        <button className="pill-button about-ok" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
