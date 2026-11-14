// Where the sun is in the sky: our own implementation of the low-precision solar
// position formulas in Jean Meeus, "Astronomical Algorithms" (chapters 25 and
// 28), the same maths behind NOAA's solar calculator. Good to about a hundredth
// of a degree for this century, far finer than anyone can turn on the spot.
// Used for the qibla's sun aid: "The sun is now 35° to the right of the qibla".

const DEG = Math.PI / 180;
const sin = (d: number) => Math.sin(d * DEG);
const cos = (d: number) => Math.cos(d * DEG);
const norm360 = (d: number) => ((d % 360) + 360) % 360;

export interface SunPosition {
  /** Degrees clockwise from true north */
  azimuth: number;
  /** Degrees above the horizon, with atmospheric refraction (what the eye sees) */
  elevation: number;
  /** Apparent declination, degrees */
  declination: number;
  /** Equation of time, minutes (apparent minus mean solar time) */
  equationOfTime: number;
}

/** Days since 2000-01-01 12:00 TT in Julian centuries (UT stands in for TT: 70 s is nothing here) */
function julianCentury(ms: number): number {
  const jd = ms / 86_400_000 + 2440587.5;
  return (jd - 2451545) / 36525;
}

/** Declination and equation of time for a moment */
export function solarCoordinates(ms: number): { declination: number; equationOfTime: number } {
  const T = julianCentury(ms);
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032)); // mean longitude
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T); // mean anomaly
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T); // orbit eccentricity
  const C =
    sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    sin(2 * M) * (0.019993 - 0.000101 * T) +
    sin(3 * M) * 0.000289; // equation of centre
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega); // apparent longitude
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * cos(omega); // corrected obliquity
  const declination = Math.asin(sin(eps) * sin(lambda)) / DEG;
  const y = Math.tan((eps / 2) * DEG) ** 2;
  const eot =
    y * sin(2 * L0) -
    2 * e * sin(M) +
    4 * e * y * sin(M) * cos(2 * L0) -
    0.5 * y * y * sin(4 * L0) -
    1.25 * e * e * sin(2 * M);
  return { declination, equationOfTime: (4 * eot) / DEG };
}

/** Refraction near the horizon, degrees (NOAA's piecewise fit, standard atmosphere) */
function refraction(elevation: number): number {
  if (elevation > 85) return 0;
  const t = Math.tan(elevation * DEG);
  let arcsec: number;
  if (elevation > 5) arcsec = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
  else if (elevation > -0.575) arcsec = 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
  else arcsec = -20.772 / t;
  return arcsec / 3600;
}

/** The sun seen from a place (degrees, east longitude positive) at a moment */
export function sunPosition(ms: number, lat: number, lng: number): SunPosition {
  const { declination, equationOfTime } = solarCoordinates(ms);
  const d = new Date(ms);
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  const trueSolarMinutes = (((utcMinutes + equationOfTime + 4 * lng) % 1440) + 1440) % 1440;
  const hourAngle = trueSolarMinutes / 4 - 180;

  const cosZenith = Math.min(1, Math.max(-1, sin(lat) * sin(declination) + cos(lat) * cos(declination) * cos(hourAngle)));
  const geometric = 90 - Math.acos(cosZenith) / DEG;
  const azimuth = norm360(
    Math.atan2(sin(hourAngle), cos(hourAngle) * sin(lat) - Math.tan(declination * DEG) * cos(lat)) / DEG + 180,
  );
  return { azimuth, elevation: geometric + refraction(geometric), declination, equationOfTime };
}

/** Signed difference b - a folded into (-180, 180]: positive is clockwise */
export function signedAngle(a: number, b: number): number {
  const d = norm360(b - a);
  return d > 180 ? d - 360 : d;
}

export type SunAid =
  | { kind: 'below' }
  | { kind: 'overhead' }
  | { kind: 'ahead' }
  | { kind: 'behind' }
  | { kind: 'side'; side: 'left' | 'right'; degrees: number };

/** Above this the sun is too near overhead to point anywhere useful */
export const SUN_TOO_HIGH = 75;

/**
 * Where the sun sits relative to someone facing the qibla. `degrees` is rounded
 * to a whole number; within 2° counts as straight ahead or behind.
 */
export function sunAid(qiblaBearing: number, sun: Pick<SunPosition, 'azimuth' | 'elevation'>): SunAid {
  if (sun.elevation <= 0) return { kind: 'below' };
  if (sun.elevation > SUN_TOO_HIGH) return { kind: 'overhead' };
  const delta = signedAngle(qiblaBearing, sun.azimuth);
  const degrees = Math.round(Math.abs(delta));
  if (degrees <= 2) return { kind: 'ahead' };
  if (degrees >= 178) return { kind: 'behind' };
  return { kind: 'side', side: delta > 0 ? 'right' : 'left', degrees };
}
