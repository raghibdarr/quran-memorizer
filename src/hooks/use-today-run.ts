'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTodaysPlan } from './use-todays-plan';
import { nextTodayHref, TODAY_RUN } from '@/lib/today-run';
import { NAV_FORWARD } from '@/lib/nav';

/** Is this screen part of a "Start today" run? (read at action time — no Suspense needed) */
export const inTodayRun = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('from') === TODAY_RUN;

/**
 * Continue a "Start today" run: go to the next unfinished item of today's plan,
 * or Home when the day is done. Replaces the finished step in history, so Back
 * from the next step goes Home rather than into a finished session.
 */
export function useContinueToday() {
  const router = useRouter();
  const { todaysPlan } = useTodaysPlan();
  const latest = useRef(todaysPlan);
  useEffect(() => {
    latest.current = todaysPlan;
  });
  return useCallback(() => {
    const next = latest.current ? nextTodayHref(latest.current) : null;
    router.replace(next ?? '/', { transitionTypes: [NAV_FORWARD] });
  }, [router]);
}
