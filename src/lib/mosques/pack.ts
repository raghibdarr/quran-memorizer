// Country mosque packs (all-in-one spec 3.7, 4): built at build time from
// OpenStreetMap by scripts/build-mosques.mjs into public/data/mosques/<CC>.json.
// The app fetches one country's file and nothing else: the request carries the
// country code only, never a position. In the native apps the file is inside
// the app bundle; on the web the service worker keeps a copy for offline use.

import { bearingDeg, haversineKm, type LatLng } from './geo';

export const PACK_VERSION = 1;
export const OSM_ATTRIBUTION = 'Data © OpenStreetMap contributors (ODbL)';

/** One mosque as the pack stores it: [lat, lng, name?, nameAr?, nameEn?] */
export type PackEntry = [number, number, ...string[]];

export interface MosquePack {
  v: number;
  /** ISO 3166-1 alpha-2, upper case */
  cc: string;
  /** When the data was taken from OpenStreetMap (YYYY-MM-DD) */
  date: string;
  attribution: string;
  m: PackEntry[];
}

export interface PackIndex {
  v: number;
  date: string;
  countries: Record<string, { count: number; bytes: number }>;
}

export interface Mosque extends LatLng {
  /** '' when the map has no name for it */
  name: string;
  nameAr: string;
  nameEn: string;
}

export interface NearMosque extends Mosque {
  distanceKm: number;
  /** Degrees clockwise from true north, from the user's place */
  bearing: number;
}

/** The path the app fetches for a country; the country code is the only thing it says */
export function packPath(cc: string): string {
  return `/data/mosques/${cc.toUpperCase()}.json`;
}

const isCc = (cc: string) => /^[A-Z]{2}$/.test(cc);

/** Checks the shape of a parsed pack; returns a list of problems (empty = fine) */
export function validatePack(raw: unknown, cc?: string): string[] {
  const p = raw as Partial<MosquePack> | null;
  const errors: string[] = [];
  if (!p || typeof p !== 'object') return ['not an object'];
  if (p.v !== PACK_VERSION) errors.push(`version ${String(p.v)}`);
  if (typeof p.cc !== 'string' || !isCc(p.cc)) errors.push('bad country code');
  else if (cc && p.cc !== cc.toUpperCase()) errors.push(`country ${p.cc}, expected ${cc}`);
  if (typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) errors.push('bad date');
  if (p.attribution !== OSM_ATTRIBUTION) errors.push('missing OSM attribution');
  if (!Array.isArray(p.m)) return [...errors, 'no mosque list'];
  for (let i = 0; i < p.m.length; i++) {
    const e = p.m[i] as unknown;
    const ok =
      Array.isArray(e) &&
      e.length >= 2 &&
      e.length <= 5 &&
      typeof e[0] === 'number' &&
      typeof e[1] === 'number' &&
      Number.isFinite(e[0]) &&
      Number.isFinite(e[1]) &&
      Math.abs(e[0]) <= 90 &&
      Math.abs(e[1]) <= 180 &&
      e.slice(2).every((s) => typeof s === 'string');
    if (!ok) {
      errors.push(`entry ${i} malformed`);
      break;
    }
  }
  return errors;
}

export function toMosque(e: PackEntry): Mosque {
  return { lat: e[0], lng: e[1], name: e[2] ?? '', nameAr: e[3] ?? '', nameEn: e[4] ?? '' };
}

export class PackError extends Error {
  constructor(
    readonly kind: 'missing' | 'network' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'PackError';
  }
}

/**
 * Fetches and checks one country's pack. GET with no query string, no body and
 * no credentials: the only thing the request reveals is which country.
 */
export async function loadPack(cc: string, fetchImpl: typeof fetch = fetch): Promise<MosquePack> {
  const code = cc.toUpperCase();
  if (!isCc(code)) throw new PackError('missing', `no pack for "${cc}"`);
  let res: Response;
  try {
    res = await fetchImpl(packPath(code), { credentials: 'omit' });
  } catch (err) {
    throw new PackError('network', err instanceof Error ? err.message : 'network error');
  }
  if (res.status === 404) throw new PackError('missing', `no pack for ${code}`);
  if (!res.ok) throw new PackError('network', `HTTP ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new PackError('invalid', 'not JSON');
  }
  const errors = validatePack(json, code);
  if (errors.length) throw new PackError('invalid', errors.join('; '));
  return json as MosquePack;
}

/** The `limit` mosques nearest `from`, nearest first (ties by name, so the order is stable) */
export function nearestMosques(pack: Pick<MosquePack, 'm'>, from: LatLng, limit = 20): NearMosque[] {
  const all = pack.m.map((e) => {
    const m = toMosque(e);
    return { ...m, distanceKm: haversineKm(from, m), bearing: bearingDeg(from, m) };
  });
  all.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name) || a.lat - b.lat || a.lng - b.lng);
  return all.slice(0, Math.max(0, limit));
}
