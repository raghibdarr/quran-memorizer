'use client';

import { useEffect, useState } from 'react';
import { addDays } from '@/lib/hijri/calendar';
import { fastTimes, type FastTimes } from '@/lib/worship/ramadan';
import type { PolarDay } from '@/lib/prayer/engine';
import { usePlaceStore } from '@/stores/place-store';
import { calcSettingsOf, usePrayerStore } from '@/stores/prayer-store';

export interface FastDay {
  /** The place's calendar day these times belong to */
  iso: string;
  today: FastTimes;
  tomorrow: FastTimes;
  tz: string;
  /** Polar day or night: the times are borrowed from the nearest day that has them (null on an ordinary day) */
  polarToday: PolarDay | null;
  polarTomorrow: PolarDay | null;
}

/**
 * Today's and tomorrow's suhoor end and iftar at the user's place. The prayer
 * engine (and adhan with it) loads by dynamic import, only when `enabled` and a
 * place is set; null until then.
 */
export function useFastTimes(enabled: boolean, today: string): FastDay | null {
  const place = usePlaceStore((s) => s.place);
  const imsakMin = usePrayerStore((s) => s.imsakMin);
  // One string so the effect reruns only when the calculation really changes
  const calcKey = usePrayerStore((s) => JSON.stringify(calcSettingsOf(s)));
  const [day, setDay] = useState<FastDay | null>(null);

  useEffect(() => {
    if (!enabled || !place) {
      setDay(null);
      return;
    }
    let live = true;
    import('@/lib/prayer/engine').then(({ computeDay, polarDay }) => {
      if (!live) return;
      const settings = JSON.parse(calcKey);
      setDay({
        iso: today,
        today: fastTimes(computeDay(place, today, settings), imsakMin),
        tomorrow: fastTimes(computeDay(place, addDays(today, 1), settings), imsakMin),
        tz: place.tz,
        polarToday: polarDay(place, today, settings),
        polarTomorrow: polarDay(place, addDays(today, 1), settings),
      });
    }).catch(() => {
      // The engine chunk couldn't load (offline before it was cached): the times stay out
    });
    return () => {
      live = false;
    };
  }, [enabled, place, today, imsakMin, calcKey]);

  return day;
}
