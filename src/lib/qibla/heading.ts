// Putting the pieces together: a raw sensor heading, corrected to true north
// where we can, and how far the phone is from the qibla.

import { angleDiff, norm360, type RawHeading } from './compass';
import type { DeclinationResult } from './declination';

export interface TrueHeading {
  heading: number;
  /** 'magnetic' when the sensor is magnetic and no declination could be applied */
  reference: 'true' | 'magnetic';
}

/**
 * True heading from a sensor reading: iOS already reports true north; a
 * magnetic reading (Android) gets the WMM declination added (east positive).
 */
export function toTrueHeading(raw: Pick<RawHeading, 'heading' | 'reference'>, declination: DeclinationResult | null): TrueHeading {
  if (raw.reference === 'true') return { heading: norm360(raw.heading), reference: 'true' };
  if (declination?.ok) return { heading: norm360(raw.heading + declination.degrees), reference: 'true' };
  return { heading: norm360(raw.heading), reference: 'magnetic' };
}

/** How far to turn to face the qibla: positive is right (clockwise), in (-180, 180] */
export function turnToQibla(heading: number, qiblaBearing: number): number {
  return angleDiff(heading, qiblaBearing);
}

/** The Kaaba (the coordinates adhan measures the qibla to) */
const KAABA = { lat: 21.4225241, lng: 39.8261818 };
/** Inside this distance a saved place (a city centre, or a coarse fix a few km out) can't give a direction */
export const NEAR_KAABA_KM = 30;

/** Great-circle distance to the Kaaba, km */
export function distanceToKaabaKm(lat: number, lng: number): number {
  const rad = Math.PI / 180;
  const dLat = (KAABA.lat - lat) * rad;
  const dLng = (KAABA.lng - lng) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(KAABA.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearKaaba(lat: number, lng: number): boolean {
  return distanceToKaabaKm(lat, lng) < NEAR_KAABA_KM;
}
