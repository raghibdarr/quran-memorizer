'use client';

import { useMemo } from 'react';
import { useStatsStore } from '@/stores/stats-store';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useTodaysPlan } from '@/hooks/use-todays-plan';
import { computeGoalAyahProgress, computeTodaysPlan } from '@/lib/plan';
import { shouldCelebrateDay } from '@/lib/day-status';
import { addLocalDays, endOfDayMs } from '@/lib/dates';
import Button from '@/components/ui/button';
import { CheckIcon, FlameIcon } from '@/components/ui/icons';

/** One line tying today to the streak and the goal — shared by Home and lesson-complete */
export function DayCompleteSummary() {
  const { plan, allSurahs, juzIndex, planLessons, dayEnd } = useTodaysPlan();
  const streak = useStatsStore((s) => s.currentStreak);
  const progressLessons = useProgressStore((s) => s.lessons);
  const lessonCards = useReviewStore((s) => s.lessonCards);

  const goal = useMemo(
    () => (plan && allSurahs.length && juzIndex.length && plan.goalType !== 'maintain'
      ? computeGoalAyahProgress(plan, allSurahs, juzIndex, progressLessons)
      : null),
    [plan, allSurahs, juzIndex, progressLessons],
  );

  // Tomorrow's preview: the same planner, run as of the end of tomorrow
  const tomorrow = useMemo(() => {
    if (!plan || !allSurahs.length) return null;
    const tomorrowEnd = endOfDayMs(addLocalDays(dayEnd, 1));
    return computeTodaysPlan(plan, planLessons, progressLessons, lessonCards, allSurahs, tomorrowEnd);
  }, [plan, planLessons, progressLessons, lessonCards, allSurahs, dayEnd]);

  let tomorrowLine: string | null = null;
  if (tomorrow) {
    const parts = [
      tomorrow.reviews.length > 0 && `${tomorrow.reviews.length} review${tomorrow.reviews.length === 1 ? '' : 's'}`,
      tomorrow.revisions.length > 0 && `${tomorrow.revisions.length} revision${tomorrow.revisions.length === 1 ? '' : 's'}`,
      tomorrow.newLessons.length > 0 && `${tomorrow.newLessons.length} new lesson${tomorrow.newLessons.length === 1 ? '' : 's'}`,
    ].filter(Boolean);
    tomorrowLine = tomorrow.isRestDay
      ? 'Tomorrow is a rest day.'
      : parts.length > 0
        ? `Tomorrow: ${parts.join(' · ')}`
        : 'Nothing scheduled for tomorrow yet.';
  }

  return (
    <div className="space-y-2">
      {streak > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gold-deep">
          <FlameIcon size={14} /> Day {streak} streak
        </p>
      )}
      {goal && (
        <p className="text-xs text-muted">
          {goal.percentage}% of your goal memorized · {goal.memorized} of {goal.total} ayahs
        </p>
      )}
      {tomorrowLine && <p className="text-xs text-muted">{tomorrowLine}</p>}
    </div>
  );
}

/**
 * The Home-screen day-complete moment (M6, audit M6). Shown once per day: it
 * appears the first time the plan's last task is done after real work today, and
 * acknowledging it records the day (synced) so no other device or visit repeats
 * it. Until acknowledged it stays — a moment you never saw hasn't happened.
 */
export default function DayCompleteMoment() {
  const { dayStatus, activitiesToday, ready, today } = useTodaysPlan();
  const celebratedOn = useStatsStore((s) => s.dayCompleteCelebratedOn);
  const markDayCelebrated = useStatsStore((s) => s.markDayCelebrated);

  if (!ready || !shouldCelebrateDay(dayStatus, { todayIso: today, celebratedOn, activitiesToday })) return null;
  const acknowledge = () => markDayCelebrated(today);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-complete-title"
      onClick={acknowledge}
    >
      <div
        className="tactile-card w-full max-w-sm rounded-2xl bg-card p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckIcon size={30} />
        </div>
        <h2 id="day-complete-title" className="mt-4 text-xl font-bold text-foreground">
          That&apos;s today&apos;s plan done
        </h2>
        <p className="mt-1 text-sm text-muted">Every review, revision and lesson — finished.</p>
        <div className="mt-4">
          <DayCompleteSummary />
        </div>
        <Button className="mt-5 w-full" onClick={acknowledge}>
          Alhamdulillah
        </Button>
      </div>
    </div>
  );
}
