'use client';

import { useEffect } from 'react';
import { isNative } from '@/lib/native';

// Must match RESYNC_EVENT in prayer/alerts/sync-runner.ts (kept here so callers don't load the runner)
const RESYNC_EVENT = 'takrar:prayer-resync';

/** Fired on window after every replan, so the alerts screen can look at what is pending again.
 *  Must match SYNCED_EVENT in prayer/alerts/sync-runner.ts */
export const PRAYER_SYNCED_EVENT = 'takrar:prayer-synced';

/** Ask PrayerSync to replan now (the alerts screen calls this after a permission or exact-alarm grant) */
export function requestPrayerResync() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RESYNC_EVENT));
}

/**
 * Keeps this device's prayer alerts in step with the place and the prayer
 * settings (all-in-one spec 6), mounted app-wide in providers.tsx. The work
 * lives in sync-runner.ts, loaded by dynamic import in the native shells only:
 * on the web nothing loads, and Home's first load stays free of the stores,
 * the planner and adhan. Taps are routed by ReminderSync's listener (any
 * notification's extra.url). Renders nothing.
 */
export function PrayerSync() {
  useEffect(() => {
    if (!isNative()) return;
    let stop: (() => void) | null = null;
    let live = true;
    import('@/components/prayer/alerts/sync-runner')
      .then((m) => {
        if (live) stop = m.startPrayerSync();
      })
      .catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  return null;
}

export default PrayerSync;
