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
