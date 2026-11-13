'use client';

import type { PrayerName } from '@/types/prayer';

export interface AdhkarNowProps {
  /** From currentWindow(): morning (Fajr to sunrise), evening (Asr to Maghrib) */
  window: 'morning' | 'evening' | null;
  /** The prayer whose time has entered, for its after-prayer adhkar */
  afterPrayer: PrayerName | null;
}

/** Slot (all-in-one spec 3.4) on /prayer: the "adhkar now" chip. Owner: adhkar-duas. */
export function AdhkarNow({ window, afterPrayer }: AdhkarNowProps) {
  void window; void afterPrayer;
  return null;
}

export default AdhkarNow;
