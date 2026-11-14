'use client';

import type { PrayerName } from '@/types/prayer';
import TrackerTick from '@/components/worship/tracker-tick';

export interface RowTrackerProps {
  /** The place's local day (YYYY-MM-DD) the row belongs to */
  iso: string;
  prayer: PrayerName;
  /** When the prayer's time begins and ends (epoch ms) */
  endMs: number;
  startMs: number;
}

/**
 * Slot (all-in-one spec 3.4) on each /prayer row: the tracker tick. Tap a
 * passed prayer to log it (on time before `endMs`, late after); hold for On
 * time / Late / Missed / Clear; inert before `startMs`. Owner: worship-tracking.
 */
export function RowTracker({ iso, prayer, startMs, endMs }: RowTrackerProps) {
  return <TrackerTick iso={iso} prayer={prayer} startMs={startMs} endMs={endMs} />;
}

export default RowTracker;
