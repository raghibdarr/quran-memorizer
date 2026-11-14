'use client';

import { todayIso } from '@/lib/hijri/calendar';
import { usePlaceStore } from '@/stores/place-store';
import { usePrayerStore } from '@/stores/prayer-store';

/** Today's civil date (in the place's zone when one is set) and the user's Hijri offset */
export function useHijriToday(now: number): { today: string; offset: number; tz: string | undefined } {
  const tz = usePlaceStore((s) => s.place?.tz);
  const offset = usePrayerStore((s) => s.hijriOffset);
  return { today: todayIso(now, tz), offset, tz };
}
