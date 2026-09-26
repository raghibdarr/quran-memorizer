'use client';

import { useStatsStore } from '@/stores/stats-store';
import { reentryDay } from '@/lib/recovery';
import { isoFromMs } from '@/lib/dates';
import { useDayClock } from './use-day-clock';

/** Today's re-entry day for a returner (0 = the day they came back), or null (M7) */
export function useReentryDay(): number | null {
  const reentry = useStatsStore((s) => s.reentry);
  const dayEnd = useDayClock();
  return reentryDay(reentry, isoFromMs(dayEnd));
}
