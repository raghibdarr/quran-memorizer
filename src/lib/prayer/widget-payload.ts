// What the Android home-screen widget needs for prayer times (all-in-one spec
// 3.3 / 3.4): the next 7 days of the five prayers, from the stores. The widget's
// single writer (src/components/widget-sync.tsx, android-native) passes this to
// TakrarWidget.update as `prayers`.
//
// Async on purpose: the engine (and adhan) load by dynamic import, so the widget
// sync that every screen mounts doesn't pull adhan into Home's first load.

import { addDaysIso } from '@/lib/dates';
import { usePlaceStore } from '@/stores/place-store';
import { calcSettingsOf, usePrayerStore } from '@/stores/prayer-store';
import { PRAYER_NAMES, TIME_LABELS, type Place, type PrayerCalcSettings } from '@/types/prayer';

export const WIDGET_DAYS = 7;

export interface PrayerWidgetPayload {
  /** In time order; `at` is epoch ms. Names are display labels ('Fajr') */
  prayers: { name: string; at: number }[];
}

type Engine = Pick<typeof import('./engine'), 'computeDay' | 'isoInTz'>;

/** Pure core: the payload for a place and settings, from `now` for WIDGET_DAYS days */
export function buildWidgetPayload(place: Place, settings: PrayerCalcSettings, now: number, engine: Engine): PrayerWidgetPayload {
  const today = engine.isoInTz(now, place.tz);
  const prayers: PrayerWidgetPayload['prayers'] = [];
  for (let i = 0; i < WIDGET_DAYS; i++) {
    const day = engine.computeDay(place, addDaysIso(today, i), settings);
    for (const p of PRAYER_NAMES) {
      const at = day[p];
      if (at !== null && at >= now - 6 * 3600_000) prayers.push({ name: TIME_LABELS[p], at });
    }
  }
  return { prayers };
}

/** The widget payload from the live stores, or null before a place is set */
export async function prayerWidgetPayload(now = Date.now()): Promise<PrayerWidgetPayload | null> {
  const place = usePlaceStore.getState().place;
  if (!place) return null;
  const engine = await import('./engine');
  return buildWidgetPayload(place, calcSettingsOf(usePrayerStore.getState()), now, engine);
}
