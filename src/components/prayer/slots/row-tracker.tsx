'use client';

import type { PrayerName } from '@/types/prayer';

export interface RowTrackerProps {
  /** The place's local day (YYYY-MM-DD) the row belongs to */
  iso: string;
  prayer: PrayerName;
  /** When the prayer's time begins and ends (epoch ms) */
  startMs: number;
  endMs: number;
}

/** Slot (all-in-one spec 3.4) on each /prayer row: the tracker tick. Owner: worship-tracking. */
export function RowTracker({ iso, prayer, startMs, endMs }: RowTrackerProps) {
  void iso; void prayer; void startMs; void endMs;
  return null;
}

export default RowTracker;
