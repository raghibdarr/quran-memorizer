'use client';

// The body of <PrayerSync/> (all-in-one spec 6), loaded by dynamic import inside
// the native shells only, so Home's first load carries none of it: not the
// stores, not the planner, not adhan. Keeps prayer alerts in step with the place
// and settings: replans on start, on every return to the app, on any settings
// or place change, on request, and when the place's day rolls over. Debounced
// here and hash-skipped in applyRange, so most runs touch nothing.

import { usePlaceStore } from '@/stores/place-store';
import { usePrayerStore, type PrayerData } from '@/stores/prayer-store';
import { nativePlatform } from '@/lib/native';
import type { Place } from '@/types/prayer';

export const RESYNC_EVENT = 'takrar:prayer-resync';
/** Fired after every replan, whatever it did (must match PRAYER_SYNCED_EVENT in prayer-sync.tsx) */
export const SYNCED_EVENT = 'takrar:prayer-synced';
const RESCHEDULE_DEBOUNCE_MS = 1500;
const ROLLOVER_CHECK_MS = 60_000;

/** The place's calendar day, without loading the engine */
function dayIn(tz: string | undefined): string {
  if (!tz) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
  } catch {
    return new Date().toDateString();
  }
}

/** The fields a plan depends on (a change in anything else must not replan) */
const planKey = (place: Place | null, s: PrayerData) =>
  JSON.stringify([place, s.method, s.madhab, s.highLatRule, s.offsets, s.customAngles ?? null, s.alerts]);

async function replan() {
  const place = usePlaceStore.getState().place;
  const s = usePrayerStore.getState();
  const glue = await import('@/lib/prayer/notifications');
  // No place, or every prayer off: nothing to plan. Clear only what was handed over before
  if (!place || !Object.values(s.alerts).some((a) => a.mode !== 'off')) {
    await glue.clearPrayerAlerts();
    return;
  }
  // Without permission the OS would drop them; the alerts screen asks, then resyncs
  if ((await glue.alertPermission()) !== 'granted') return;
  const { planPrayerAlerts } = await import('@/lib/prayer/schedule');
  const settings = {
    method: s.method,
    madhab: s.madhab,
    highLatRule: s.highLatRule,
    offsets: s.offsets,
    ...(s.customAngles ? { customAngles: s.customAngles } : {}),
    alerts: s.alerts,
  };
  const plan = planPrayerAlerts({ now: Date.now(), place, settings, platform: nativePlatform() });
  await glue.syncPrayerAlerts(plan);
}

/** Starts keeping alerts in step; returns the cleanup */
export function startPrayerSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // One replan at a time: a slow one finishing after a newer one would hand the OS a stale plan
  let queue: Promise<void> = Promise.resolve();
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      queue = queue
        .then(replan, replan)
        .catch(() => {})
        .then(() => {
          window.dispatchEvent(new Event(SYNCED_EVENT));
        });
    }, RESCHEDULE_DEBOUNCE_MS);
  };

  let key = planKey(usePlaceStore.getState().place, usePrayerStore.getState());
  const onStores = () => {
    const next = planKey(usePlaceStore.getState().place, usePrayerStore.getState());
    if (next === key) return;
    key = next;
    schedule();
  };
  const stopPlace = usePlaceStore.subscribe(onStores);
  const stopPrayer = usePrayerStore.subscribe(onStores);

  const onVisible = () => {
    if (!document.hidden) schedule();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(RESYNC_EVENT, schedule);

  let day = dayIn(usePlaceStore.getState().place?.tz);
  const rollover = setInterval(() => {
    const now = dayIn(usePlaceStore.getState().place?.tz);
    if (now !== day) {
      day = now;
      schedule();
    }
  }, ROLLOVER_CHECK_MS);

  schedule();
  return () => {
    clearTimeout(timer);
    clearInterval(rollover);
    stopPlace();
    stopPrayer();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener(RESYNC_EVENT, schedule);
  };
}
