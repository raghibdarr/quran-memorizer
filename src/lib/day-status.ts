// THE one definition of "done today" (M6, audit M5). Every surface that shows
// daily progress — the home ring, Today's Plan, the lesson-complete screen, the
// day-complete moment, the app-icon badge — reads this, never its own count.
//
// Plan users: today's plan items, counted individually (each lesson review, each
// surah revision, each new lesson). Planless users: the activity goal in settings.

import type { LessonReviewCard, TodaysPlan } from '@/types/quran';
import { startOfDayMs } from './dates';

export interface DayStatus {
  mode: 'plan' | 'activity';
  done: number;
  remaining: number;
  total: number;
  /** Nothing left today AND there was something to do */
  complete: boolean;
  isRestDay: boolean;
}

export function planDayStatus(
  todaysPlan: TodaysPlan,
  lessonCards: LessonReviewCard[],
  lastRevisedAt: Record<number, number>,
  now: number,
): DayStatus {
  const todayStart = startOfDayMs(now);
  // Done = touched today. Reviews and revisions leave the plan once done, so the
  // totals are rebuilt from timestamps rather than remembered.
  const reviewsDone = lessonCards.filter((c) => c.lastReview >= todayStart).length;
  const revisionsDone = Object.values(lastRevisedAt).filter((ts) => ts >= todayStart).length;
  const lessonsDone = todaysPlan.completedNewLessonIds.length;

  const remaining =
    todaysPlan.reviews.length +
    todaysPlan.revisions.length +
    (todaysPlan.newLessons.length - lessonsDone);
  const done = reviewsDone + revisionsDone + lessonsDone;
  const total = done + remaining;

  return { mode: 'plan', done, remaining, total, complete: remaining === 0 && total > 0, isRestDay: todaysPlan.isRestDay };
}

export function activityDayStatus(activitiesToday: number, dailyGoal: number): DayStatus {
  const goal = Math.max(1, dailyGoal);
  const done = Math.min(activitiesToday, goal);
  return { mode: 'activity', done, remaining: goal - done, total: goal, complete: activitiesToday >= goal, isRestDay: false };
}

/**
 * The day-complete moment fires once per day (replay-guarded by date — redoing a
 * lesson can't re-fire it), and only after real work today: marking a surah
 * "known" stamps its revision time, which must not count as finishing the day.
 */
export function shouldCelebrateDay(
  status: DayStatus,
  opts: { todayIso: string; celebratedOn: string | null; activitiesToday: number },
): boolean {
  return status.mode === 'plan' && status.complete && opts.activitiesToday > 0 && opts.celebratedOn !== opts.todayIso;
}
