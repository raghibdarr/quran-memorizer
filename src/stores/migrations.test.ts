// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { migrateReviews } from './review-store'
import { migrateStats } from './stats-store'
import { startOfDayMs, todayIso, addDaysIso } from '@/lib/dates'

// M3's one-time data migrations. Both are deliberately NON-destructive
// (truncate / clamp / add-fields only) — that's why no blocking backup prompt
// gates them (deviation from the plan's scope line, noted in build-plan.md).

describe('migrateReviews v1→v2 (SM-2 timestamps → local start-of-day)', () => {
  it('truncates nextReview on cards and lessonCards; lastReview untouched', () => {
    const eightPm = new Date(2026, 6, 10, 20, 0).getTime()
    const migrated = migrateReviews({
      cards: [{ surahId: 112, ayahNumber: 1, nextReview: eightPm, lastReview: eightPm }],
      lessonCards: [{ lessonId: '112-1', nextReview: eightPm + 123, lastReview: eightPm }],
    }, 1)
    expect(migrated.cards[0].nextReview).toBe(startOfDayMs(eightPm))
    expect(migrated.cards[0].lastReview).toBe(eightPm) // merge tiebreak data, keep
    expect(migrated.lessonCards[0].nextReview).toBe(startOfDayMs(eightPm))
  })

  it('is a no-op at the current version', () => {
    const state = { cards: [{ nextReview: 123 }], lessonCards: [] }
    expect(migrateReviews(state, 2)).toBe(state)
  })

  it('tolerates missing arrays and missing nextReview', () => {
    const migrated = migrateReviews({}, 1)
    expect(migrated.cards).toEqual([])
    expect(migrateReviews({ cards: [{ surahId: 1, ayahNumber: 1 }], lessonCards: [] }, 1)
      .cards[0].nextReview).toBe(startOfDayMs(0))
  })
})

describe('migrateStats v2→v3 (freeze fields + future-date clamp)', () => {
  it('adds freeze fields and clamps future-dated day strings to today', () => {
    const tomorrow = addDaysIso(todayIso(), 1)
    const migrated = migrateStats({
      currentStreak: 3, longestStreak: 9,
      lastActiveDate: tomorrow, dailyActivityDate: tomorrow,
      dailyActivities: 2, activityLog: {},
    }, 2)
    expect(migrated.streakFreezes).toBe(0)
    expect(migrated.frozenDates).toEqual({})
    expect(migrated.lastActiveDate).toBe(todayIso())
    expect(migrated.dailyActivityDate).toBe(todayIso())
    expect(migrated.longestStreak).toBe(9) // ACCEPTANCE: longestStreak preserved
  })

  it('leaves sane past dates alone', () => {
    const migrated = migrateStats({ lastActiveDate: '2026-01-01', dailyActivityDate: null, activityLog: {} }, 2)
    expect(migrated.lastActiveDate).toBe('2026-01-01')
  })
})
