'use client';

import { madeUpSurplus } from '@/lib/worship/log';
import { useWorshipStore, type PrayerMark } from '@/stores/worship-store';
import type { PrayerName } from '@/types/prayer';

/**
 * Sets (or with null, clears) one prayer's mark from a sheet. If that takes away
 * a "missed" that had already been made up, the make-up count comes back down
 * with it, so it can't cancel a later one.
 */
export function changeMark(iso: string, prayer: PrayerName, s: PrayerMark | null) {
  const { markPrayer, clearPrayer, addMadeUp } = useWorshipStore.getState();
  if (s) markPrayer(iso, prayer, s);
  else clearPrayer(iso, prayer);
  const { prayers, madeUp } = useWorshipStore.getState();
  const surplus = madeUpSurplus(prayers, madeUp.prayers);
  if (surplus > 0) addMadeUp('prayers', -surplus);
}
