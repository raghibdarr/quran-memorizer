import { describe, expect, it } from 'vitest'
import { reconcileStreak, recordActiveDay, missedStudyDays, ALL_DAYS, MAX_BANKED_FREEZES, type StreakFields } from './streak'

const WEEKDAYS = [1, 2, 3, 4, 5] // Mon–Fri

function state(overrides: Partial<StreakFields> = {}): StreakFields {
  return {
    currentStreak: 5,
    longestStreak: 10,
    lastActiveDate: '2026-07-10', // a Friday
    streakFreezes: 0,
    frozenDates: {},
    ...overrides,
  }
}

describe('rest-day-aware streaks', () => {
  it('ACCEPTANCE: a Mon–Fri plan user\'s streak survives the weekend', () => {
    // Active Friday 2026-07-10, next opens the app Monday 2026-07-13
    const settled = reconcileStreak(state(), '2026-07-13', WEEKDAYS)
    expect(settled.currentStreak).toBe(5)

    const monday = recordActiveDay(state(), '2026-07-13', WEEKDAYS)
    expect(monday.currentStreak).toBe(6)
    expect(monday.lastActiveDate).toBe('2026-07-13')
  })

  it('an every-day user with no freezes loses the streak after one missed day', () => {
    // Active Friday, returns Sunday — Saturday was required and unprotected
    const sunday = recordActiveDay(state(), '2026-07-12', ALL_DAYS)
    expect(sunday.currentStreak).toBe(1)
  })

  it('activity on a rest day still counts toward the streak', () => {
    // Mon–Fri plan, active Friday, studies anyway on Saturday
    const saturday = recordActiveDay(state(), '2026-07-11', WEEKDAYS)
    expect(saturday.currentStreak).toBe(6)
  })

  it('consecutive days always increment regardless of plan', () => {
    const next = recordActiveDay(state(), '2026-07-11', ALL_DAYS)
    expect(next.currentStreak).toBe(6)
    expect(next.longestStreak).toBe(10)
  })

  it('longestStreak rises with the current streak', () => {
    const s = recordActiveDay(state({ currentStreak: 10 }), '2026-07-11', ALL_DAYS)
    expect(s.longestStreak).toBe(11)
  })
})

describe('streak freezes', () => {
  it('one banked freeze auto-covers a single missed study day', () => {
    // Active Friday, missed Saturday, opens Sunday with 1 freeze
    const settled = reconcileStreak(state({ streakFreezes: 1 }), '2026-07-12', ALL_DAYS)
    expect(settled.currentStreak).toBe(5)
    expect(settled.streakFreezes).toBe(0)
    expect(settled.frozenDates['2026-07-11']).toBe(true)
  })

  it('freezes only cover study days — a weekend gap costs nothing on a Mon–Fri plan', () => {
    const settled = reconcileStreak(state({ streakFreezes: 2 }), '2026-07-13', WEEKDAYS)
    expect(settled.streakFreezes).toBe(2)
    expect(settled.currentStreak).toBe(5)
  })

  it('STRICTLY FORGIVING: a gap too big to cover breaks the streak but keeps the bank', () => {
    // 3 missed days, only 2 freezes — burning them would just be punishment
    const settled = reconcileStreak(state({ streakFreezes: 2 }), '2026-07-14', ALL_DAYS)
    expect(settled.currentStreak).toBe(0)
    expect(settled.streakFreezes).toBe(2)
    expect(settled.frozenDates).toEqual({})
  })

  it('a freeze is earned each time the streak completes a week, capped at 2', () => {
    const week1 = recordActiveDay(state({ currentStreak: 6, lastActiveDate: '2026-07-10' }), '2026-07-11')
    expect(week1.currentStreak).toBe(7)
    expect(week1.streakFreezes).toBe(1)

    const week2 = recordActiveDay(
      state({ currentStreak: 13, streakFreezes: 1, lastActiveDate: '2026-07-10' }), '2026-07-11')
    expect(week2.streakFreezes).toBe(2)

    const week3 = recordActiveDay(
      state({ currentStreak: 20, streakFreezes: MAX_BANKED_FREEZES, lastActiveDate: '2026-07-10' }), '2026-07-11')
    expect(week3.streakFreezes).toBe(MAX_BANKED_FREEZES)
  })

  it('non-week days do not earn freezes', () => {
    const s = recordActiveDay(state({ currentStreak: 7, lastActiveDate: '2026-07-10' }), '2026-07-11')
    expect(s.currentStreak).toBe(8)
    expect(s.streakFreezes).toBe(0)
  })
})

describe('reconcile is safe to run repeatedly', () => {
  it('is idempotent after covering a gap with freezes', () => {
    const once = reconcileStreak(state({ streakFreezes: 2 }), '2026-07-13', ALL_DAYS)
    const twice = reconcileStreak(once, '2026-07-13', ALL_DAYS)
    expect(twice).toEqual(once)
    expect(once.streakFreezes).toBe(0) // spent exactly once
  })

  it('is idempotent after a break', () => {
    const once = reconcileStreak(state(), '2026-07-14', ALL_DAYS)
    expect(once.currentStreak).toBe(0)
    expect(reconcileStreak(once, '2026-07-14', ALL_DAYS)).toEqual(once)
  })

  it('ACCEPTANCE: opening after 3 idle days shows the settled state — reconcile then record agree', () => {
    // reconcile on load breaks the streak; the user's first tap starts at 1,
    // never "5 then silently 1"
    const onLoad = reconcileStreak(state(), '2026-07-14', ALL_DAYS)
    expect(onLoad.currentStreak).toBe(0)
    const afterTap = recordActiveDay(onLoad, '2026-07-14', ALL_DAYS)
    expect(afterTap.currentStreak).toBe(1)
  })

  it('no-ops when nothing is missed (same day, next day, fresh state)', () => {
    const s = state()
    expect(reconcileStreak(s, '2026-07-10', ALL_DAYS)).toBe(s)
    expect(reconcileStreak(s, '2026-07-11', ALL_DAYS)).toBe(s)
    const fresh = state({ currentStreak: 0, lastActiveDate: null })
    expect(reconcileStreak(fresh, '2026-07-14', ALL_DAYS)).toBe(fresh)
  })
})

describe('missedStudyDays', () => {
  it('excludes both endpoints, rest days, and already-frozen days', () => {
    expect(missedStudyDays('2026-07-10', '2026-07-14', ALL_DAYS, { '2026-07-12': true }))
      .toEqual(['2026-07-11', '2026-07-13'])
    // Fri → Mon on a weekday plan: Sat/Sun aren't study days
    expect(missedStudyDays('2026-07-10', '2026-07-13', WEEKDAYS, {})).toEqual([])
  })
})

describe('clock going backwards (review finding)', () => {
  it('activity on a day BEFORE lastActiveDate changes nothing — no streak inflation', () => {
    const ahead = state({ currentStreak: 5, lastActiveDate: '2026-09-27' })
    const back = recordActiveDay(ahead, '2026-09-26', ALL_DAYS)
    expect(back).toBe(ahead)
    // and returning to the real "next" day extends exactly once
    expect(recordActiveDay(back, '2026-09-28', ALL_DAYS).currentStreak).toBe(6)
  })
})
