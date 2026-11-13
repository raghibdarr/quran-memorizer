// One coarse location fix, on request only (all-in-one spec 1.3, 1.4). Never
// watched, never in the background, never sent anywhere: the caller stores the
// rounded result in the device-only place store and nowhere else.

import { Capacitor } from '@capacitor/core';

/** Two decimal places, about 1 km: enough for prayer times, too coarse to locate a home */
export function roundCoord(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

export type LocationResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' | 'unsupported' };

const TIMEOUT_MS = 15_000;
/** An OS-cached fix this recent is fine: a city-level answer needs no fresh GPS */
const MAX_AGE_MS = 30 * 60_000;

function rounded(lat: number, lng: number): LocationResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: 'unavailable' };
  return { ok: true, lat: roundCoord(lat), lng: roundCoord(lng) };
}

async function nativeFix(): Promise<LocationResult> {
  // Loaded only when asked: nothing location-related runs at startup
  const { Geolocation } = await import('@capacitor/geolocation');
  try {
    let perm = await Geolocation.checkPermissions();
    if (perm.coarseLocation !== 'granted' && perm.location !== 'granted') {
      perm = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
    }
    if (perm.coarseLocation !== 'granted' && perm.location !== 'granted') return { ok: false, reason: 'denied' };
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS });
    return rounded(pos.coords.latitude, pos.coords.longitude);
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('denied') || msg.includes('permission')) return { ok: false, reason: 'denied' };
    if (msg.includes('timeout')) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'unavailable' };
  }
}

function webFix(): Promise<LocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve({ ok: false, reason: 'unsupported' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(rounded(pos.coords.latitude, pos.coords.longitude)),
      (err) => resolve({ ok: false, reason: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  });
}

/**
 * Asks once for a coarse position (call only from a "Use my location" tap). The
 * native plugin asks for coarse permission only; the web uses
 * navigator.geolocation with high accuracy off. Coordinates come back rounded.
 */
export function getCoarseLocation(): Promise<LocationResult> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Geolocation')) return nativeFix();
  return webFix();
}

/** The device's own IANA time zone ('' if the platform can't say) */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}
