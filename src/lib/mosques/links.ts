// "Open in Maps" for one mosque. The link carries the MOSQUE's public map
// position (never the user's) and opens only when the user taps it: Android and
// most desktops hand a geo: URI to the maps app; iOS has no geo: handler, so it
// gets Apple Maps' own maps: scheme, which also stays on the device until the
// Maps app takes over.

import type { Mosque } from './pack';

export type MapsPlatform = 'ios' | 'other';

/** Best guess at the platform, from Capacitor when present, else the user agent */
export function mapsPlatform(): MapsPlatform {
  if (typeof window === 'undefined') return 'other';
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();
  if (p === 'ios') return 'ios';
  if (p === 'android') return 'other';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  // iPadOS reports a Mac user agent with touch
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

/** A short label for the pin: the name, else "Mosque" */
export function pinLabel(m: Pick<Mosque, 'name' | 'nameEn'>): string {
  return (m.nameEn || m.name || 'Mosque').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function mapsHref(m: Mosque, platform: MapsPlatform = 'other'): string {
  const ll = `${m.lat},${m.lng}`;
  const label = encodeURIComponent(pinLabel(m));
  if (platform === 'ios') return `maps://?ll=${ll}&q=${label}`;
  return `geo:${ll}?q=${ll}(${label})`;
}
