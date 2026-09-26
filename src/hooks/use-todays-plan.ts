'use client';

import { useEffect, useMemo, useState } from 'react';
import type { JuzMeta, SurahMeta } from '@/types/quran';
import { usePlanStore } from '@/stores/plan-store';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getJuzIndex, getSurahIndex } from '@/lib/quran-data';
import { computePlanProgress, computeTodaysPlan, getPlanLessons } from '@/lib/plan';
import { activityDayStatus, planDayStatus } from '@/lib/day-status';
import { isoFromMs } from '@/lib/dates';
import { useDayClock } from './use-day-clock';

/**
 * Today's plan + THE day status (src/lib/day-status.ts) for any surface that
 * shows daily progress. Plan users get plan-driven status; planless users get
 * the activity goal. `ready` is false until the surah/juz indexes have loaded.
 */
export function useTodaysPlan() {
  const plan = usePlanStore((s) => s.plan);
  const progressLessons = useProgressStore((s) => s.lessons);
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const dailyActivities = useStatsStore((s) => s.dailyActivities);
  const dailyActivityDate = useStatsStore((s) => s.dailyActivityDate);
  const dailyGoal = useSettingsStore((s) => s.dailyGoalActivities);
  // End of the current local day — changes at midnight, so the plan rolls over
  // on screens left open overnight (and render stays pure)
  const dayEnd = useDayClock();
  const today = isoFromMs(dayEnd);

  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);
  useEffect(() => {
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, []);

  const planLessons = useMemo(
    () => (plan && allSurahs.length && juzIndex.length ? getPlanLessons(plan, allSurahs, juzIndex) : []),
    [plan, allSurahs, juzIndex],
  );

  const todaysPlan = useMemo(
    () => (plan && allSurahs.length ? computeTodaysPlan(plan, planLessons, progressLessons, lessonCards, allSurahs, dayEnd) : null),
    [plan, planLessons, progressLessons, lessonCards, allSurahs, dayEnd],
  );

  const progress = useMemo(
    () => (plan && planLessons.length ? computePlanProgress(plan, planLessons, progressLessons, dayEnd) : null),
    [plan, planLessons, progressLessons, dayEnd],
  );

  const activitiesToday = dailyActivityDate === today ? dailyActivities : 0;
  const dayStatus = useMemo(
    () =>
      plan && todaysPlan
        ? planDayStatus(todaysPlan, lessonCards, plan.lastRevisedAt, dayEnd)
        : activityDayStatus(activitiesToday, dailyGoal),
    [plan, todaysPlan, lessonCards, activitiesToday, dailyGoal, dayEnd],
  );

  return {
    plan,
    todaysPlan,
    progress,
    planLessons,
    allSurahs,
    juzIndex,
    dayStatus,
    activitiesToday,
    dayEnd,
    today,
    ready: allSurahs.length > 0 && juzIndex.length > 0,
  };
}
