// "Start today" (persona tests, 2026-09): one run through the day's plan instead of
// bouncing back to Home between every stream. The order is the hifdh cycle's own:
// reviews (sabqi + manzil, one session) → surah revisions → new lessons.
// Every step recomputes from the live plan, so a step finished elsewhere is skipped.

import type { TodaysPlan } from '@/types/quran';
import { lessonHref } from './routes';
import { lessonWordCounts } from './curriculum';
import { estimateLessonSeconds } from './lesson-time';

export const TODAY_RUN = 'today';

/** Where the run goes next, or null when today is done */
export function nextTodayHref(tp: TodaysPlan): string | null {
  if (tp.reviews.length > 0) return `/review/session?from=${TODAY_RUN}`;
  if (tp.revisions.length > 0) return `/plan/revise/${tp.revisions[0].surahId}?from=${TODAY_RUN}`;
  const lesson = tp.newLessons.find((l) => !tp.completedNewLessonIds.includes(l.lessonId));
  return lesson ? lessonHref(lesson.surahId, lesson.lessonNumber) : null;
}

const RECITE_SEC_PER_WORD = 1.5;
const words = (surahId: number, ayahStart: number, ayahEnd: number) =>
  lessonWordCounts({ surahId, ayahStart, ayahEnd }).reduce((s, w) => s + w, 0);

/** What's left today, in seconds: recite-and-check per review/revision, the full lesson model for new work */
export function estimateTodaySeconds(tp: TodaysPlan): number {
  const reviews = tp.reviews.reduce((s, c) => s + words(c.surahId, c.ayahStart, c.ayahEnd) * RECITE_SEC_PER_WORD * 1.3 + 20, 0);
  const revisions = tp.revisions.reduce((s, r) => s + words(r.surahId, r.ayahStart, r.ayahEnd) * RECITE_SEC_PER_WORD * 1.3 + 30, 0);
  const lessons = tp.newLessons
    .filter((l) => !tp.completedNewLessonIds.includes(l.lessonId))
    .reduce((s, l) => s + estimateLessonSeconds(lessonWordCounts(l)), 0);
  return reviews + revisions + lessons;
}

export function formatTodayTime(tp: TodaysPlan): string {
  const min = Math.max(1, Math.round(estimateTodaySeconds(tp) / 60));
  return min < 10 ? `~${min} min` : `~${Math.round(min / 5) * 5} min`;
}
