// Lapse recovery (M7) — PURE scheduling for people coming back after time away.
// The failure it prevents: a returner opening the app to "Card 1 of 60" and a
// streak silently reset to 1, and quitting again. Instead: acknowledge the gap,
// shrink day one, drill the weakest material first, and spread the debt out.

import type { LessonReviewCard } from '@/types/quran';
import { addDaysIso, daysBetween, isStudyDay } from './dates';

export const RECOVERY = {
  /** A gap longer than this many days starts a re-entry period */
  LAPSE_THRESHOLD_DAYS: 14,
  /** Reviews allowed on re-entry day 0; each later day allows REENTRY_CAP_STEP more */
  REENTRY_FIRST_DAY_CAP: 10,
  REENTRY_CAP_STEP: 5,
  /** Re-entry ends when the backlog is gone, or after this many days regardless */
  REENTRY_MAX_DAYS: 7,
  /** Catch-up never more than doubles the chosen pace on a day */
  CATCH_UP_MAX_EXTRA_PER_DAY_FACTOR: 1,
} as const;

/** Persisted (stats store, synced) when a lapse is detected on open */
export interface Reentry {
  /** Local day the user came back */
  startedOn: string;
  gapDays: number;
  /** The streak they had before the gap broke it — shown, never silently dropped */
  streakBefore: number;
  acknowledged: boolean;
}

/** Days since the last active day, when it exceeds the lapse threshold — else null */
export function detectLapse(lastActiveDate: string | null, todayIso: string): number | null {
  if (!lastActiveDate) return null;
  const gap = daysBetween(lastActiveDate, todayIso);
  return gap > RECOVERY.LAPSE_THRESHOLD_DAYS ? gap : null;
}

/** Which re-entry day today is (0 = the return day), or null when not in re-entry */
export function reentryDay(reentry: Reentry | null | undefined, todayIso: string): number | null {
  if (!reentry) return null;
  const d = daysBetween(reentry.startedOn, todayIso);
  return d >= 0 && d < RECOVERY.REENTRY_MAX_DAYS ? d : null;
}

export function reentryReviewCap(day: number): number {
  return RECOVERY.REENTRY_FIRST_DAY_CAP + RECOVERY.REENTRY_CAP_STEP * Math.max(0, day);
}

/**
 * Weakest first: the lessons most likely to have slipped get consolidated before
 * anything else — lowest last rating, then longest failure streak, then lowest
 * ease, then most overdue.
 */
export function weakestFirst(cards: LessonReviewCard[]): LessonReviewCard[] {
  return [...cards].sort(
    (a, b) =>
      a.lastQuality - b.lastQuality ||
      (b.failStreak ?? 0) - (a.failStreak ?? 0) ||
      a.easeFactor - b.easeFactor ||
      a.nextReview - b.nextReview,
  );
}

/**
 * Trim a due list to today's re-entry cap, weakest first. Reviews already done
 * today count against the cap — finishing the day's 10 must not unlock 10 more.
 */
export function triageReviews(
  due: LessonReviewCard[],
  day: number,
  doneToday = 0,
): { kept: LessonReviewCard[]; deferred: number } {
  const cap = Math.max(0, reentryReviewCap(day) - doneToday);
  const kept = weakestFirst(due).slice(0, cap);
  return { kept, deferred: due.length - kept.length };
}

export interface RecoveryDay {
  date: string;
  reviews: number;
  extraLessons: number;
}

/**
 * Spread a returner's whole debt — the review backlog AND the lessons behind
 * schedule (audit M16: the old catch-up ignored reviews, which dominate a
 * returner's debt, and dumped up to 10 bonus lessons on one day). Reviews go
 * first under the growing re-entry cap; extra lessons only start once the
 * backlog is down to a day's worth, and never more than double the pace.
 * Rest days carry nothing.
 */
export function planDebtRecovery(opts: {
  lessonsBehind: number;
  reviewBacklog: number;
  pace: number;
  studyDays: number[];
  todayIso: string;
  maxDays?: number;
}): RecoveryDay[] {
  const maxDays = opts.maxDays ?? 120;
  const maxExtra = Math.max(1, Math.round(opts.pace * RECOVERY.CATCH_UP_MAX_EXTRA_PER_DAY_FACTOR));
  let reviews = opts.reviewBacklog;
  let lessons = opts.lessonsBehind;
  const days: RecoveryDay[] = [];
  let studyIndex = 0;

  for (let i = 0; i < maxDays && (reviews > 0 || lessons > 0); i++) {
    const date = addDaysIso(opts.todayIso, i);
    if (!isStudyDay(date, opts.studyDays)) continue;
    const cap = reentryReviewCap(studyIndex);
    const r = Math.min(reviews, cap);
    reviews -= r;
    // Lessons wait until the remaining backlog fits in the next day's cap — and a
    // returner's first day (any review backlog) is reviews only
    const lessonsAllowed = reviews <= reentryReviewCap(studyIndex + 1) && (studyIndex > 0 || opts.reviewBacklog === 0);
    const e = lessonsAllowed ? Math.min(lessons, maxExtra) : 0;
    lessons -= e;
    days.push({ date, reviews: r, extraLessons: e });
    studyIndex++;
  }
  return days;
}

/** The spread-out catch-up to store on the plan: extra lessons per study day until a date */
export function catchUpSpread(lessonsBehind: number, pace: number, studyDays: number[], todayIso: string) {
  const days = planDebtRecovery({ lessonsBehind, reviewBacklog: 0, pace, studyDays, todayIso });
  const withLessons = days.filter((d) => d.extraLessons > 0);
  if (withLessons.length === 0) return null;
  return {
    extraPerDay: Math.max(...withLessons.map((d) => d.extraLessons)),
    from: withLessons[0].date,
    until: withLessons[withLessons.length - 1].date,
    studyDays: withLessons.length,
  };
}

/**
 * A new target date for a plan whose deadline passed (audit M13): today + the
 * study days the remaining lessons need at the current pace, plus a week of slack.
 */
export function suggestNewDeadline(remainingLessons: number, pace: number, studyDays: number[], todayIso: string): string {
  const perDay = Math.max(1, pace);
  let needed = Math.ceil(remainingLessons / perDay);
  let date = todayIso;
  for (let i = 0; needed > 0 && i < 20_000; i++) {
    date = addDaysIso(todayIso, i + 1);
    if (isStudyDay(date, studyDays)) needed--;
  }
  return addDaysIso(date, 7);
}
