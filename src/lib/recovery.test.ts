import { describe, expect, it } from 'vitest'
import {
  catchUpSpread,
  detectLapse,
  planDebtRecovery,
  reentryDay,
  reentryReviewCap,
  RECOVERY,
  suggestNewDeadline,
  triageReviews,
  weakestFirst,
} from './recovery'
import { daysBetween, isStudyDay } from './dates'
import type { LessonReviewCard } from '@/types/quran'

const card = (id: string, o: Partial<LessonReviewCard> = {}): LessonReviewCard => {
  const [s, l] = id.split('-').map(Number)
  return { lessonId: id, surahId: s, lessonNumber: l, ayahStart: 1, ayahEnd: 3, easeFactor: 2.5, interval: 7, repetitions: 3, nextReview: 1000, lastReview: 0, lastQuality: 4, ...o }
}
const ALL = [0, 1, 2, 3, 4, 5, 6]

describe('lapse detection', () => {
  it('ACCEPTANCE: returning after 2 days does NOT trigger welcome-back; after 30 it does', () => {
    expect(detectLapse('2026-09-24', '2026-09-26')).toBeNull()
    expect(detectLapse('2026-09-12', '2026-09-26')).toBeNull() // exactly the threshold
    expect(detectLapse('2026-08-27', '2026-09-26')).toBe(30)
    expect(detectLapse(null, '2026-09-26')).toBeNull() // brand-new user, not a returner
  })

  it('re-entry lasts a bounded number of days', () => {
    const r = { startedOn: '2026-09-26', gapDays: 30, streakBefore: 23, acknowledged: false }
    expect(reentryDay(r, '2026-09-26')).toBe(0)
    expect(reentryDay(r, '2026-09-28')).toBe(2)
    expect(reentryDay(r, `2026-10-0${3}`)).toBeNull() // day 7 → over
    expect(reentryDay(null, '2026-09-26')).toBeNull()
  })
})

describe('triaged re-entry', () => {
  it('ACCEPTANCE: the first session is at most 10 reviews, weakest first', () => {
    const due = Array.from({ length: 40 }, (_, i) => card(`2-${i + 1}`, { lastQuality: i === 17 ? 1 : 4, failStreak: i === 30 ? 3 : 0 }))
    const { kept, deferred } = triageReviews(due, 0)
    expect(kept).toHaveLength(RECOVERY.REENTRY_FIRST_DAY_CAP)
    expect(deferred).toBe(30)
    expect(kept[0].lessonId).toBe('2-18') // lowest last rating first
  })

  it('weakestFirst: rating, then failure streak, then ease, then most overdue', () => {
    const sorted = weakestFirst([
      card('1-1', { lastQuality: 4, easeFactor: 2.5, nextReview: 5 }),
      card('1-2', { lastQuality: 3 }),
      card('1-3', { lastQuality: 4, failStreak: 2 }),
      card('1-4', { lastQuality: 4, easeFactor: 1.8 }),
      card('1-5', { lastQuality: 4, easeFactor: 2.5, nextReview: 1 }),
    ])
    expect(sorted.map((c) => c.lessonId)).toEqual(['1-2', '1-3', '1-4', '1-5', '1-1'])
  })

  it('the daily cap grows as the returner settles back in', () => {
    expect([0, 1, 2, 3].map(reentryReviewCap)).toEqual([10, 15, 20, 25])
  })
})

describe('debt recovery schedule', () => {
  it('ACCEPTANCE: 25 lessons + 40 reviews spread over days, caps respected, reviews first', () => {
    const days = planDebtRecovery({ lessonsBehind: 25, reviewBacklog: 40, pace: 1, studyDays: ALL, todayIso: '2026-09-26' })
    expect(days.length).toBeGreaterThan(1)
    days.forEach((d, i) => {
      expect(d.reviews).toBeLessThanOrEqual(reentryReviewCap(i))
      expect(d.extraLessons).toBeLessThanOrEqual(1) // never more than double a 1/day pace
    })
    expect(days[0]).toMatchObject({ reviews: 10, extraLessons: 0 }) // day one: reviews only
    expect(days.reduce((s, d) => s + d.reviews, 0)).toBe(40)
    expect(days.reduce((s, d) => s + d.extraLessons, 0)).toBe(25)
    const firstLessonDay = days.findIndex((d) => d.extraLessons > 0)
    const remainingAfter = 40 - days.slice(0, firstLessonDay + 1).reduce((s, d) => s + d.reviews, 0)
    expect(remainingAfter).toBeLessThanOrEqual(reentryReviewCap(firstLessonDay + 1))
  })

  it('rest days carry nothing', () => {
    const days = planDebtRecovery({ lessonsBehind: 5, reviewBacklog: 12, pace: 1, studyDays: [1, 3, 5], todayIso: '2026-09-26' })
    for (const d of days) expect(isStudyDay(d.date, [1, 3, 5])).toBe(true)
  })

  it('an ordinary catch-up (no review backlog) can start today and spreads the lessons', () => {
    const spread = catchUpSpread(6, 2, ALL, '2026-09-26')!
    expect(spread.from).toBe('2026-09-26')
    expect(spread.extraPerDay).toBe(2)
    expect(spread.studyDays).toBe(3)
    expect(catchUpSpread(0, 1, ALL, '2026-09-26')).toBeNull()
  })
})

describe('lapsed deadline', () => {
  it('suggests a date the remaining lessons actually fit, with a week of slack', () => {
    const d = suggestNewDeadline(10, 1, ALL, '2026-09-26')
    expect(daysBetween('2026-09-26', d)).toBe(17)
    // Mon–Fri plan from a Saturday: 10 lessons end Fri 9 Oct (13 days), + a week
    const weekdays = suggestNewDeadline(10, 1, [1, 2, 3, 4, 5], '2026-09-26')
    expect(daysBetween('2026-09-26', weekdays)).toBe(20)
  })
})

describe('re-entry is not a treadmill', () => {
  it('reviews already done today count against the day\'s cap', () => {
    const due = Array.from({ length: 30 }, (_, i) => card(`2-${i + 1}`))
    expect(triageReviews(due, 0, 10).kept).toHaveLength(0)
    expect(triageReviews(due, 0, 4).kept).toHaveLength(6)
  })
})
