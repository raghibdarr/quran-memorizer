'use client';

import { useEffect } from 'react';
import { useStatsStore } from '@/stores/stats-store';

/**
 * Settle day-dependent state (streak freezes/breaks) on load, on tab return,
 * and when local midnight passes with the app open — so the UI never paints a
 * stale streak that would silently reset on the user's next tap (M3).
 * reconcile() is idempotent and only publishes on an actual change.
 */
export function useDayRollover() {
  useEffect(() => {
    const run = () => useStatsStore.getState().reconcile();
    run();

    const onVisible = () => {
      if (!document.hidden) run();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(run, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, []);
}
