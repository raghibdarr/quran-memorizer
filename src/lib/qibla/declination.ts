// Magnetic declination from the World Magnetic Model, our own evaluation of
// NOAA's public-domain WMM2025 coefficients (data-sources/wmm). Android's
// absolute orientation points at MAGNETIC north; adding the declination turns it
// into a true-north heading, which is what the qibla bearing is measured from.
//
// The maths follows the WMM2025 technical report: geodetic to geocentric
// coordinates, time-adjusted Gauss coefficients, Schmidt semi-normalised
// associated Legendre functions, the field's north/east/down components in
// geocentric axes, rotated back to geodetic. Runs on the device, no network.

import { WMM_COEFFICIENTS, WMM_EPOCH, WMM_VALID_UNTIL } from './wmm2025';

const DEG = Math.PI / 180;
/** WGS-84 semi-major axis (km) and flattening */
const WGS84_A = 6378.137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
/** Geomagnetic reference radius (km) */
const RE = 6371.2;
const N_MAX = 12;

/** Coefficient tables indexed [n][m], built once */
const G: number[][] = [];
const H: number[][] = [];
const GD: number[][] = [];
const HD: number[][] = [];
for (let n = 0; n <= N_MAX; n++) {
  G.push(new Array(n + 1).fill(0));
  H.push(new Array(n + 1).fill(0));
  GD.push(new Array(n + 1).fill(0));
  HD.push(new Array(n + 1).fill(0));
}
for (const [n, m, g, h, gd, hd] of WMM_COEFFICIENTS) {
  G[n][m] = g;
  H[n][m] = h;
  GD[n][m] = gd;
  HD[n][m] = hd;
}

export interface MagneticField {
  /** Declination: degrees east of true north that a compass needle points (west negative) */
  declination: number;
  /** Inclination (dip), degrees, down positive */
  inclination: number;
  /** North, east, down and horizontal intensity, nT */
  x: number;
  y: number;
  z: number;
  h: number;
}

/** Decimal year (UTC) of a moment, as the model takes it: 2026-07-02 is about 2026.5 */
export function decimalYear(date: Date): number {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}

/**
 * The main field at a place and time. `heightKm` is above the WGS-84 ellipsoid.
 * Latitude is clamped a hair short of the poles, where east and north stop
 * meaning anything.
 */
export function magneticField(lat: number, lng: number, year: number, heightKm = 0): MagneticField {
  const phi = Math.max(-89.9999, Math.min(89.9999, lat)) * DEG;
  const lambda = lng * DEG;
  const dt = year - WMM_EPOCH;

  // Geodetic to geocentric spherical
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const rc = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  const p = (rc + heightKm) * cosPhi;
  const zc = (rc * (1 - WGS84_E2) + heightKm) * sinPhi;
  const r = Math.sqrt(p * p + zc * zc);
  const phiC = Math.asin(zc / r);

  // Colatitude for the Legendre recursion
  const cosT = Math.sin(phiC);
  const sinT = Math.cos(phiC);

  // Schmidt semi-normalised P[n][m](cos θ) and dP/dθ
  const P: number[][] = [];
  const dP: number[][] = [];
  for (let n = 0; n <= N_MAX; n++) {
    P.push(new Array(n + 1).fill(0));
    dP.push(new Array(n + 1).fill(0));
  }
  P[0][0] = 1;
  dP[0][0] = 0;
  for (let m = 1; m <= N_MAX; m++) {
    const k = m === 1 ? 1 : Math.sqrt((2 * m - 1) / (2 * m));
    P[m][m] = k * sinT * P[m - 1][m - 1];
    dP[m][m] = k * (cosT * P[m - 1][m - 1] + sinT * dP[m - 1][m - 1]);
  }
  for (let m = 0; m <= N_MAX; m++) {
    for (let n = m + 1; n <= N_MAX; n++) {
      const a = 2 * n - 1;
      const b = n - 2 >= m ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
      const c = Math.sqrt(n * n - m * m);
      const p2 = n - 2 >= m ? P[n - 2][m] : 0;
      const dp2 = n - 2 >= m ? dP[n - 2][m] : 0;
      P[n][m] = (a * cosT * P[n - 1][m] - b * p2) / c;
      dP[n][m] = (a * (cosT * dP[n - 1][m] - sinT * P[n - 1][m]) - b * dp2) / c;
    }
  }

  // Field in geocentric north (X'), east (Y'), down (Z')
  let xc = 0;
  let yc = 0;
  let zcF = 0;
  for (let n = 1; n <= N_MAX; n++) {
    const ar = Math.pow(RE / r, n + 2);
    for (let m = 0; m <= n; m++) {
      const g = G[n][m] + dt * GD[n][m];
      const h = H[n][m] + dt * HD[n][m];
      const cosM = Math.cos(m * lambda);
      const sinM = Math.sin(m * lambda);
      const gh = g * cosM + h * sinM;
      xc += ar * gh * dP[n][m];
      yc += ar * m * (g * sinM - h * cosM) * P[n][m];
      zcF -= ar * (n + 1) * gh * P[n][m];
    }
  }
  yc /= sinT;

  // Rotate back to geodetic axes
  const psi = phiC - phi;
  const x = xc * Math.cos(psi) - zcF * Math.sin(psi);
  const z = xc * Math.sin(psi) + zcF * Math.cos(psi);
  const y = yc;
  const h = Math.hypot(x, y);
  return {
    declination: Math.atan2(y, x) / DEG,
    inclination: Math.atan2(z, h) / DEG,
    x,
    y,
    z,
    h,
  };
}

/** How long past its stated life we keep using the model (it drifts by roughly a tenth of a degree a year) */
const GRACE_YEARS = 2;
/**
 * Where the horizontal field is this weak (near the magnetic poles) a compass
 * needle wanders: the WMM report's "blackout zone" is H < 2000 nT.
 */
export const WEAK_FIELD_NT = 2000;

export type DeclinationResult =
  | { ok: true; degrees: number; weakField: boolean }
  | { ok: false; reason: 'expired' };

/**
 * Declination for a place, now. Not available once the model is well past its
 * life (the app then labels the heading "magnetic" rather than guess).
 */
export function declinationAt(lat: number, lng: number, date: Date): DeclinationResult {
  const year = decimalYear(date);
  if (year < WMM_EPOCH - 1 || year > WMM_VALID_UNTIL + GRACE_YEARS) return { ok: false, reason: 'expired' };
  const f = magneticField(lat, lng, year);
  return { ok: true, degrees: f.declination, weakField: f.h < WEAK_FIELD_NT };
}
