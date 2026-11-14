// Distance and direction on the sphere, for the mosque list (all-in-one spec 2.2).
// Pure maths, all on the device.

const R_KM = 6371.0088; // mean Earth radius (IUGG)
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in km (haversine) */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from true north, in [0, 360) */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const Δλ = rad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  if (x === 0 && y === 0) return 0;
  const θ = (deg(Math.atan2(y, x)) + 360) % 360;
  // (-tiny + 360) % 360 can round to 360
  return θ >= 360 ? 0 : θ;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassPoint = (typeof POINTS)[number];

const POINT_NAMES: Record<CompassPoint, string> = {
  N: 'north',
  NE: 'north-east',
  E: 'east',
  SE: 'south-east',
  S: 'south',
  SW: 'south-west',
  W: 'west',
  NW: 'north-west',
};

/** The nearest of the eight compass points */
export function compassPoint(bearing: number): CompassPoint {
  const b = ((bearing % 360) + 360) % 360;
  return POINTS[Math.round(b / 45) % 8];
}

/** 'north-east', for screen readers */
export function compassName(point: CompassPoint): string {
  return POINT_NAMES[point];
}

// Countries whose road signs are in miles
const MILES = new Set(['GB', 'US', 'LR', 'MM', 'PR', 'VI', 'GU', 'AS', 'MP']);
const KM_PER_MILE = 1.609344;

export function usesMiles(countryCode: string): boolean {
  return MILES.has(countryCode.toUpperCase());
}

/** '350 m', '1.2 km', '14 km'; or '0.2 mi', '1.2 mi', '14 mi' where signs use miles */
export function formatDistance(km: number, countryCode = ''): string {
  if (usesMiles(countryCode)) {
    const mi = km / KM_PER_MILE;
    const tenths = Math.round(mi * 10);
    if (tenths < 100) return `${(Math.max(1, tenths) / 10).toFixed(1)} mi`;
    return `${Math.round(mi)} mi`;
  }
  const metres = Math.round(km * 100) * 10;
  if (metres < 1000) return `${Math.max(10, metres)} m`;
  const tenths = Math.round(km * 10);
  if (tenths < 100) return `${(tenths / 10).toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** '0.4 miles', '350 metres', '1.2 kilometres': the same figure with the unit spelled out, for screen readers */
export function spokenDistance(formatted: string): string {
  const [n, unit] = formatted.split(' ');
  const one = Number(n) === 1;
  if (unit === 'mi') return `${n} ${one ? 'mile' : 'miles'}`;
  if (unit === 'km') return `${n} ${one ? 'kilometre' : 'kilometres'}`;
  if (unit === 'm') return `${n} metres`;
  return formatted;
}
