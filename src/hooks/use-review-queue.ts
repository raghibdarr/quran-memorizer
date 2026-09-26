'use client';

import { useMemo } from 'react';
import { useReviewStore } from '@/stores/review-store';
import { useProgressStore } from '@/stores/progress-store';
import { buildReviewQueue } from '@/lib/retention';
import { useDayClock } from './use-day-clock';
import { useReentryDay } from './use-reentry';

/** Today's review queue (M5 streams) — the ONE source for every due count and badge. */
export function useReviewQueue() {
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const progressLessons = useProgressStore((s) => s.lessons);
  const dayEnd = useDayClock();
  const reentryDay = useReentryDay();
  return useMemo(() => {
    const q = buildReviewQueue(lessonCards, progressLessons, dayEnd, { reentryDay });
    return { ...q, dueCount: q.sabqi.length + q.manzil.length };
  }, [lessonCards, progressLessons, dayEnd, reentryDay]);
}
