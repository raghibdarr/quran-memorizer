import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayIso, yesterdayIso, startOfTodayMs, startOfDayMs, isoFromMs, daysBetween, addDaysIso, isStudyDay, countStudyDays, addLocalDays, endOfDayMs } from './dates'
import { processLessonReview, processReview, createNewCard, createLessonReviewCard, isDue } from './spaced-repetition'
import type { LessonReviewCard } from '@/types/quran'

// NOTE ON TIMEZONES: these tests are written TZ-agnostically (local Date
// constructors + invariant assertions) so they are meaningful in ANY zone.
// CI re-runs this file under a 3-zone TZ matrix (incl. DST zones) — see ci.yml.
// TZ env is unreliable on Windows Node, so locally they run in the system zone.

describe('local date helpers', () => {
  it('todayIso is a local date, not UTC', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(todayIso()).toBe(expected)
  })

  it('yesterdayIso is exactly one calendar day before todayIso', () => {
    // Compare as UTC calendar dates: the day after a local DST change is 23h/25h
    // long, so local midnights are not 24h apart (this failed in Pacific/Auckland
    // on 2026-09-28, the day after its clocks went forward)
    const today = new Date(todayIso() + 'T00:00:00Z')
    const yesterday = new Date(yesterdayIso() + 'T00:00:00Z')
    expect(today.getTime() - yesterday.getTime()).toBe(86_400_000)
  })

  it('startOfDayMs truncates to local midnight', () => {
    const d = new Date(startOfDayMs(Date.now()))
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0])
    expect(startOfDayMs(Date.now())).toBe(startOfTodayMs())
  })
})

describe('near-midnight day attribution (acceptance: 11:55pm vs 12:05am)', () => {
  afterEach(() => vi.useRealTimers())

  it('activity at 23:55 and 00:05 local lands on the respective calendar days', () => {
    vi.useFakeTimers()

    vi.setSystemTime(new Date(2026, 6, 11, 23, 55)) // July 11, 11:55pm LOCAL
    expect(todayIso()).toBe('2026-07-11')
    expect(isoFromMs(Date.now())).toBe('2026-07-11')

    vi.setSystemTime(new Date(2026, 6, 12, 0, 5)) // ten minutes later
    expect(todayIso()).toBe('2026-07-12')
    expect(yesterdayIso()).toBe('2026-07-11')
    // Stats (todayIso) and plan (isStudyDay/daysBetween on todayIso) read the
    // SAME string — cross-module day agreement is structural, pinned here.
    expect(daysBetween('2026-07-11', todayIso())).toBe(1)
  })
})

describe('calendar arithmetic on day strings (DST-immune)', () => {
  it('daysBetween and addDaysIso are exact across DST transitions', () => {
    // US spring-forward 2026-03-08 and fall-back 2026-11-01: a local-time diff
    // would yield 23h/25h "days"; UTC-space arithmetic must stay integer-exact.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
    expect(addDaysIso('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDaysIso('2026-11-01', -1)).toBe('2026-10-31')
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-07-12', '2026-07-11')).toBe(-1)
  })

  it('startOfDayMs stays within the same local day across a DST-transition day', () => {
    // 11pm on the US spring-forward day (a 23h day in DST zones): truncation
    // must land on THAT day's local midnight, not drift a day.
    const elevenPm = new Date(2026, 2, 8, 23, 0).getTime()
    expect(new Date(startOfDayMs(elevenPm)).getDate()).toBe(8)
    expect(isoFromMs(startOfDayMs(elevenPm))).toBe('2026-03-08')
    expect(isoFromMs(elevenPm)).toBe('2026-03-08')
  })

  it('isStudyDay reads the weekday of the day string itself', () => {
    expect(isStudyDay('2026-07-12', [0])).toBe(true) // a Sunday
    expect(isStudyDay('2026-07-13', [0])).toBe(false) // a Monday
  })

  it('countStudyDays counts inclusively and respects the plan days', () => {
    // Mon 2026-07-13 .. Sun 2026-07-19 on a Mon–Fri plan
    expect(countStudyDays('2026-07-13', '2026-07-19', [1, 2, 3, 4, 5])).toBe(5)
    expect(countStudyDays('2026-07-13', '2026-07-13', [1])).toBe(1)
    expect(countStudyDays('2026-07-14', '2026-07-13', [0, 1, 2, 3, 4, 5, 6])).toBe(0)
  })
})

describe('SM-2 due dates are local start-of-day', () => {
  const baseLessonCard: LessonReviewCard = {
    lessonId: '1-1', surahId: 1, lessonNumber: 1, ayahStart: 1, ayahEnd: 7,
    easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastReview: 0, lastQuality: 0,
  }

  it('a review completed at any time of day is due at MIDNIGHT of the target day', () => {
    // The old behavior (nextReview = now + interval) made an 8pm review mature at
    // 8pm N days later — flipping "done today" back to "due" mid-evening.
    const updated = processLessonReview(baseLessonCard, 5)
    const due = new Date(updated.nextReview)
    expect([due.getHours(), due.getMinutes()]).toEqual([0, 0])
    expect(updated.nextReview).toBe(addLocalDays(Date.now(), updated.interval))
  })

  it('ayah cards behave the same', () => {
    const updated = processReview(createNewCard(1, 1), 4)
    const due = new Date(updated.nextReview)
    expect([due.getHours(), due.getMinutes()]).toEqual([0, 0])
  })

  it('a card reviewed today is NOT due again today (interval >= 1 day)', () => {
    const updated = processLessonReview(baseLessonCard, 5)
    expect(updated.interval).toBeGreaterThanOrEqual(1)
    expect(isDue(updated)).toBe(false)
  })

  it('new lesson cards due tomorrow mature at tomorrow midnight, not 24h from now', () => {
    const card = createLessonReviewCard(
      { lessonId: '1-1', surahId: 1, lessonNumber: 1, ayahStart: 1, ayahEnd: 7, ayahCount: 7, juzNumber: 1 },
      1,
      false,
    )
    const due = new Date(card.nextReview)
    expect([due.getHours(), due.getMinutes()]).toEqual([0, 0])
  })
})

describe('calendar-day stepping (review finding: SM-2 due dates across DST)', () => {
  it('addLocalDays lands on local midnight N calendar days later, even from 00:30 on a clock-change day', () => {
    // EU fall-back 2026-10-25 and spring-forward 2026-03-29; US 2026-11-01 / 2026-03-08.
    // In a DST zone, 00:30 + 24h can stay on the same date — calendar stepping never does.
    for (const [y, m, d] of [[2026, 9, 25], [2026, 2, 29], [2026, 10, 1], [2026, 2, 8]]) {
      const halfPastMidnight = new Date(y, m, d, 0, 30).getTime()
      const next = new Date(addLocalDays(halfPastMidnight, 1))
      expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([new Date(y, m, d + 1).getDate(), 0, 0])
      expect(isoFromMs(addLocalDays(halfPastMidnight, 7))).toBe(isoFromMs(new Date(y, m, d + 7, 12).getTime()))
    }
  })

  it('endOfDayMs is the last millisecond before the next local midnight', () => {
    const noon = new Date(2026, 9, 25, 12).getTime()
    expect(endOfDayMs(noon) + 1).toBe(addLocalDays(noon, 1))
    expect(isoFromMs(endOfDayMs(noon))).toBe(isoFromMs(noon))
  })
})
