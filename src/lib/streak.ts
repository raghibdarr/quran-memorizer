// Pure streak engine (M3) — rest-day-aware streaks with earned freezes.
// DOM-free and store-free so it's exhaustively unit-testable (streak.test.ts)
// and portable (RN-insurance rule, build plan §6.3).
//
// The rules, in order of user impact:
//  - Only PLAN STUDY DAYS can break a streak. Rest days are neutral: they never
//    break, never need a freeze, and activity on them still counts.
//  - Freezes are earned one per full week of streak (streak hitting a multiple
//    of 7), banked up to 2, and auto-consumed one per missed study day.
//  - Freezes are strictly forgiving: they can only SAVE a streak. If a gap is
//    too big to cover fully, the streak breaks and the bank is left untouched
//    (burning freezes on an already-dead streak would just be punishment).

import { addDaysIso, daysBetween, isStudyDay } from './dates'

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

export const MAX_BANKED_FREEZES = 2
const FREEZE_EARN_EVERY_DAYS = 7

export interface StreakFields {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  /** Banked streak freezes (0..MAX_BANKED_FREEZES) */
  streakFreezes: number
  /** Days a freeze was spent on — treated as active for gap math, renderable later */
  frozenDates: Record<string, true>
}

/**
 * Study days strictly between lastActive and today that are neither rest days
 * nor already covered by a freeze — the days that threaten the streak.
 */
export function missedStudyDays(
  lastActiveDate: string,
  todayIsoStr: string,
  studyDays: number[],
  frozenDates: Record<string, true>,
): string[] {
  const gap = daysBetween(lastActiveDate, todayIsoStr)
  const missed: string[] = []
  for (let i = 1; i < gap; i++) {
    const day = addDaysIso(lastActiveDate, i)
    if (isStudyDay(day, studyDays) && !frozenDates[day]) missed.push(day)
  }
  return missed
}

/**
 * Settle streak state for the current day WITHOUT recording activity — run on
 * load and day-rollover so the UI never shows a stale streak that silently
 * resets on the next tap. Idempotent: covered days land in frozenDates, so a
 * second pass finds nothing missed.
 */
export function reconcileStreak(
  state: StreakFields,
  todayIsoStr: string,
  studyDays: number[] = ALL_DAYS,
): StreakFields {
  if (!state.lastActiveDate || state.currentStreak === 0) return state
  if (daysBetween(state.lastActiveDate, todayIsoStr) <= 1) return state // no full day missed yet

  const missed = missedStudyDays(state.lastActiveDate, todayIsoStr, studyDays, state.frozenDates)
  if (missed.length === 0) return state

  if (missed.length <= state.streakFreezes) {
    const frozenDates = { ...state.frozenDates }
    for (const day of missed) frozenDates[day] = true
    return { ...state, streakFreezes: state.streakFreezes - missed.length, frozenDates }
  }

  // Gap too big to cover — streak breaks, bank stays (strictly forgiving)
  return { ...state, currentStreak: 0 }
}

/**
 * Record the first activity of `todayIsoStr`. Reconciles the gap first (freezes
 * or break), then extends the streak and banks any newly earned freeze.
 * Caller is responsible for only invoking on the first activity of the day.
 */
export function recordActiveDay(
  state: StreakFields,
  todayIsoStr: string,
  studyDays: number[] = ALL_DAYS,
): StreakFields {
  if (state.lastActiveDate === todayIsoStr) return state

  const settled = reconcileStreak(state, todayIsoStr, studyDays)
  const newStreak = settled.currentStreak + 1

  const earned = newStreak > 0 && newStreak % FREEZE_EARN_EVERY_DAYS === 0 ? 1 : 0
  return {
    ...settled,
    currentStreak: newStreak,
    longestStreak: Math.max(settled.longestStreak, newStreak),
    lastActiveDate: todayIsoStr,
    streakFreezes: Math.min(MAX_BANKED_FREEZES, settled.streakFreezes + earned),
  }
}
