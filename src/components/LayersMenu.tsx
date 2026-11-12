import { useRef, useState } from 'react';
import type { MapMode } from './MapView';
import { Icon } from './Icon';
import { Popover } from './Popover';

export interface LayerSettings {
  mode: MapMode;
  showApproximate: boolean;
  follow: boolean;
  notify: boolean;
  /** blur photos/videos until tapped (default on) */
  blurMedia?: boolean;
  /** occupied / contested areas (default on) */
  showTerritory?: boolean;
}

interface Props {
  /** publication time and source of the territory layer, for the legend */
  territory?: { updated: number; source: { name: string; url: string }; description: string; static?: boolean; region: string } | null;
  value: LayerSettings;
  onChange(next: LayerSettings): void;
  sheet?: boolean;
}

const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;

/** Map display and live-update preferences. */
export function LayersButton({ value, onChange, sheet, territory }: Props) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(
    () => notificationsSupported && Notification.permission === 'denied',
  );
  const btn = useRef<HTMLButtonElement>(null);
  const set = (patch: Partial<LayerSettings>) => onChange({ ...value, ...patch });

  const toggleNotify = async (on: boolean) => {
    if (!on) return set({ notify: false });
    if (!notificationsSupported) return;
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    setBlocked(perm === 'denied');
    set({ notify: perm === 'granted' });
  };

  return (
    <div className="popover-anchor">
      <button
        ref={btn}
        className={`icon-button${value.mode === 'heatmap' || value.follow || value.notify ? ' is-tinted' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Map layers and live options"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Layers (L)"
        data-shortcut="layers"
      >
        <Icon name="layers" size={18} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} label="Map layers" className="layers-pop" sheet={sheet}>
        <div className="pop-head">
          <span className="pop-title">Show events as</span>
        </div>
        <div className="segmented segmented--full" role="radiogroup" aria-label="Map display">
          {(['markers', 'heatmap'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={value.mode === m}
              className={value.mode === m ? 'is-on' : ''}
              onClick={() => set({ mode: m })}
            >
              <Icon name={m === 'markers' ? 'pin' : 'flame'} size={15} />
              {m === 'markers' ? 'Markers' : 'Heatmap'}
            </button>
          ))}
        </div>

        <div className="pop-foot pop-foot--stack">
          <label className="switch-row">
            <span>
              Territorial control
              {territory ? (
                <>
                  <small className="territory-legend">
                    {territory.region === 'ukraine' ? (
                      <>
                        <i className="swatch swatch--occupied" /> Occupied
                        <i className="swatch swatch--contested" /> Contested
                      </>
                    ) : (
                      <>
                        <i className="swatch swatch--israeli" /> Israeli-held or occupied
                      </>
                    )}
                  </small>
                  <small>{territory.description}</small>
                  <small>
                    {territory.static
                      ? `Boundaries as of ${new Date(territory.updated).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
                      : `As of ${new Date(territory.updated).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}{' '}
                    ·{' '}
                    <a href={territory.source.url} target="_blank" rel="noopener noreferrer">
                      {territory.source.name}
                    </a>
                  </small>
                </>
              ) : (
                <small>Shown on the Ukraine and Israel–Palestine tabs</small>
              )}
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={value.showTerritory ?? true}
              onChange={(e) => set({ showTerritory: e.target.checked })}
            />
          </label>
          <label className="switch-row">
            <span>
              Approximate locations
              <small>Reports that only name a country or province</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={value.showApproximate}
              onChange={(e) => set({ showApproximate: e.target.checked })}
            />
          </label>
          <label className="switch-row">
            <span>
              Follow new events
              <small>Move the map to each new report</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={value.follow}
              onChange={(e) => set({ follow: e.target.checked })}
            />
          </label>
          <label className="switch-row">
            <span>
              Blur media
              <small>Photos and videos stay blurred until you tap them; war footage can be graphic</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={value.blurMedia ?? true}
              onChange={(e) => set({ blurMedia: e.target.checked })}
            />
          </label>
          {notificationsSupported && (
            <label className="switch-row">
              <span>
                Notifications
                <small>
                  {blocked
                    ? 'Blocked — allow notifications for this site in your browser settings'
                    : 'Alert me about new reports that match my filters'}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={value.notify}
                disabled={blocked}
                onChange={(e) => void toggleNotify(e.target.checked)}
              />
            </label>
          )}
        </div>
      </Popover>
    </div>
  );
}
