// "Open in Maps" for one mosque. The link carries the MOSQUE's public map
// position (never the user's) and opens only when the user taps it:
// - Android (app or browser) hands a geo: URI to the maps app.
// - Apple devices (iPhone, iPad, Mac) have no geo: handler, so they get Apple
//   Maps' own maps: scheme.
// - Other desktop browsers (Windows, Linux) mostly have no handler for either,
//   so they open the mosque on openstreetmap.org in a new tab: the same data
//   the list comes from, a plain link the user chooses to follow, with no
//   referrer. The app itself still draws no map tiles.

import type { Mosque } from './pack';

/** 'ios' means any Apple device (iPhone, iPad, Mac): they share the maps: scheme */
export type MapsPlatform = 'ios' | 'android' | 'web';

/** Best guess at the platform, from Capacitor when present, else the user agent */
export function mapsPlatform(): MapsPlatform {
  if (typeof window === 'undefined') return 'android';
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();
  if (p === 'ios') return 'ios';
  if (p === 'android') return 'android';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  // iPadOS reports a Mac user agent; a real Mac has Apple Maps and no geo: handler either
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'web';
}

/** A short label for the pin: the name, else "Mosque" */
export function pinLabel(m: Pick<Mosque, 'name' | 'nameEn'>): string {
  return (m.nameEn || m.name || 'Mosque').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function mapsHref(m: Mosque, platform: MapsPlatform = 'android'): string {
  const ll = `${m.lat},${m.lng}`;
  const label = encodeURIComponent(pinLabel(m));
  if (platform === 'ios') return `maps://?ll=${ll}&q=${label}`;
  if (platform === 'web') return `https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lng}#map=18/${m.lat}/${m.lng}`;
  return `geo:${ll}?q=${ll}(${label})`;
}

/** The web link leaves the app, so it opens in a new tab; the app schemes hand over to the maps app */
export function opensInNewTab(platform: MapsPlatform): boolean {
  return platform === 'web';
}
