import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { buildReviewQueue, getLeeches, planManzil, streamOf, RETENTION, type ManzilItem } from './retention'
import { processEarlyLessonReview, processLessonReview, processReview, createNewCard } from './spaced-repetition'
import { startOfDayMs } from './dates'
import type { LessonProgress, LessonReviewCard } from '@/types/quran'

const DAY = 86_400_000
const NOW = new Date(2026, 8, 26, 12, 0).getTime() // local noon
const TODAY = startOfDayMs(NOW)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

function card(id: string, o: Partial<LessonReviewCard> = {}): LessonReviewCard {
  const [s, l] = id.split('-').map(Number)
  return {
    lessonId: id, surahId: s, lessonNumber: l, ayahStart: 1, ayahEnd: 5,
    easeFactor: 2.5, interval: 7, repetitions: 3, nextReview: TODAY + 5 * DAY,
    lastReview: NOW - 2 * DAY, lastQuality: 4, ...o,
  }
}
function done(id: string, daysAgo: number): LessonProgress {
  const [s] = id.split('-').map(Number)
  return {
    lessonId: id, surahId: s, currentPhase: 'complete', phaseData: {} as LessonProgress['phaseData'],
    startedAt: 0, completedAt: NOW - daysAgo * DAY,
  }
}

// ---------- streams ----------

describe('sabqi / manzil split', () => {
  it('a lesson completed inside the window is sabqi; older is manzil', () => {
    expect(streamOf(card('1-1'), done('1-1', 3), NOW)).toBe('sabqi')
    expect(streamOf(card('1-1'), done('1-1', RETENTION.SABQI_WINDOW_DAYS + 1), NOW)).toBe('manzil')
  })

  it('without a completion record, SM-2 youth decides', () => {
    expect(streamOf(card('1-1', { repetitions: 1 }), undefined, NOW)).toBe('sabqi')
    expect(streamOf(card('1-1', { repetitions: 4 }), undefined, NOW)).toBe('manzil')
  })

  it('due cards land in their stream, most overdue first; overdue counted', () => {
    const q = buildReviewQueue(
      [
        card('1-1', { nextReview: TODAY - 3 * DAY }),
        card('1-2', { nextReview: TODAY + 1000 }),
        card('2-1', { nextReview: TODAY - DAY }),
        card('2-2', { nextReview: TODAY - 5 * DAY }),
      ],
      { '1-1': done('1-1', 4), '1-2': done('1-2', 4), '2-1': done('2-1', 60), '2-2': done('2-2', 90) },
      NOW,
    )
    expect(q.sabqi.map((c) => c.lessonId)).toEqual(['1-1', '1-2'])
    expect(q.manzil.map((c) => c.lessonId)).toEqual(['2-2', '2-1'])
    expect(q.overdueCount).toBe(3) // 1-2 is due today, not overdue
    expect(q.earlyIds.size).toBe(0)
  })
})

describe('sabqi early touches', () => {
  it('recent lessons untouched for the max gap get an early touch; recently touched ones do not', () => {
    const q = buildReviewQueue(
      [
        card('1-1', { lastReview: NOW - 4 * DAY }), // stale → early
        card('1-2', { lastReview: NOW - 1 * DAY }), // fresh → no
      ],
      { '1-1': done('1-1', 6), '1-2': done('1-2', 6) },
      NOW,
    )
    expect([...q.earlyIds]).toEqual(['1-1'])
    expect(q.sabqi.map((c) => c.lessonId)).toEqual(['1-1'])
  })

  it('early touches never exceed the daily cap, stalest first', () => {
    const ids = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6']
    const cards = ids.map((id, i) => card(id, { lastReview: NOW - (4 + i) * DAY }))
    const progress = Object.fromEntries(ids.map((id) => [id, done(id, 10)]))
    const q = buildReviewQueue(cards, progress, NOW)
    expect(q.earlyIds.size).toBe(RETENTION.SABQI_DAILY_CAP)
    expect(q.sabqi[0].lessonId).toBe('1-6') // stalest
  })

  it('completing touches today uses up the cap — the list never refills (no treadmill)', () => {
    const ids = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6']
    const progress = Object.fromEntries(ids.map((id) => [id, done(id, 10)]))
    // four already touched today, two still stale
    const cards = ids.map((id, i) => card(id, { lastReview: i < 4 ? NOW - 1000 : NOW - 5 * DAY }))
    expect(buildReviewQueue(cards, progress, NOW).earlyIds.size).toBe(0)
  })

  it('SM-2-due recent lessons consume the cap before early touches do', () => {
    const due = ['1-1', '1-2', '1-3'].map((id) => card(id, { nextReview: TODAY - DAY }))
    const stale = ['1-4', '1-5'].map((id) => card(id, { lastReview: NOW - 5 * DAY }))
    const progress = Object.fromEntries(['1-1', '1-2', '1-3', '1-4', '1-5'].map((id) => [id, done(id, 7)]))
    const q = buildReviewQueue([...due, ...stale], progress, NOW)
    expect(q.earlyIds.size).toBe(RETENTION.SABQI_DAILY_CAP - 3)
  })

  it('an early PASS records the touch without growing the interval; an early FAIL lapses', () => {
    const c = card('1-1', { interval: 3, repetitions: 2, nextReview: TODAY + 2 * DAY })
    const pass = processEarlyLessonReview(c, 5)
    expect(pass.interval).toBe(3)
    expect(pass.repetitions).toBe(2)
    expect(pass.nextReview).toBe(c.nextReview)
    expect(pass.lastReview).toBe(NOW)

    const fail = processEarlyLessonReview(c, 1)
    expect(fail.repetitions).toBe(0)
    expect(fail.interval).toBe(1)
    expect(fail.failStreak).toBe(1)
  })
})

// ---------- manzil rotation ----------

function items(counts: number[], lastTouched: (i: number) => number): ManzilItem[] {
  return counts.map((ayahCount, i) => ({ surahId: i + 1, ayahCount, lastTouched: lastTouched(i) }))
}
function loadByDay(plan: ReturnType<typeof planManzil>, its: ManzilItem[]) {
  const load: Record<number, number> = {}
  for (const it of its) {
    const d = plan.scheduledDay[it.surahId]
    load[d] = (load[d] ?? 0) + it.ayahCount
  }
  return load
}

// Juz 30's 37 surahs (78–114) — real ayah counts
const JUZ_30 = [40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]

describe('manzil rotation planner', () => {
  it('ACCEPTANCE: persona C (all of Juz 30 known, staggered) gets a bounded daily plan — no flood, no starvation', () => {
    const cycle = 14
    const its = items(JUZ_30, (i) => NOW - (i % (cycle + 1)) * DAY)
    const plan = planManzil(its, { cycleDays: cycle, now: NOW })
    const load = loadByDay(plan, its)
    for (const [day, ayahs] of Object.entries(load)) {
      expect(ayahs, `day ${day}`).toBeLessThanOrEqual(plan.budget)
    }
    expect(Math.max(...Object.values(plan.scheduledDay))).toBeLessThanOrEqual(cycle)
    expect(plan.today.length).toBeGreaterThan(0) // something to do today — no starvation
  })

  it('ACCEPTANCE (M15): 20 surahs all revised the same day never land on one day', () => {
    const cycle = 7
    const its = items(Array(20).fill(12), () => NOW - 30 * DAY) // all overdue together
    const plan = planManzil(its, { cycleDays: cycle, now: NOW })
    const todayAyahs = plan.today.length * 12
    expect(todayAyahs).toBeLessThanOrEqual(plan.budget)
    expect(plan.today.length).toBeLessThan(20)
    expect(Math.max(...Object.values(plan.scheduledDay))).toBeLessThanOrEqual(cycle)
  })

  it('does not over-revise a small collection that fits easily (no needless pulls)', () => {
    const its = items([6, 5, 4], (i) => NOW - i * DAY) // touched 0-2 days ago, cycle 7
    const plan = planManzil(its, { cycleDays: 7, now: NOW })
    expect(plan.today).toEqual([])
  })

  it('surahs revised today count against today and are never re-listed', () => {
    const its = items([30, 30, 30], (i) => (i === 0 ? NOW - 1000 : NOW - 20 * DAY))
    const plan = planManzil(its, { cycleDays: 7, now: NOW, minDailyAyahs: 40 })
    expect(plan.today).not.toContain(1)
    // budget = max(40, ceil(2*90/7)=26) = 40; 30 already used → at most one more fits... none (30+30>40)
    // except the "always at least one" rule doesn't apply since today already has work
    expect(plan.today.length).toBe(0)
  })

  it('an oversized surah still gets a day of its own', () => {
    const its = items([286], () => NOW - 20 * DAY)
    const plan = planManzil(its, { cycleDays: 7, now: NOW })
    expect(plan.today).toEqual([1])
  })

  it('least-recently-touched goes first', () => {
    const its = items([10, 10, 10], (i) => NOW - (20 + i) * DAY)
    const plan = planManzil(its, { cycleDays: 7, now: NOW, minDailyAyahs: 10 })
    expect(plan.today[0]).toBe(3)
  })

  it('PROPERTY: every memorized surah is scheduled within the cycle, and no day exceeds the budget unless a single surah is larger than it', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ ayahCount: fc.integer({ min: 3, max: 120 }), ago: fc.integer({ min: 0, max: 60 }) }), { minLength: 1, maxLength: 60 }),
        fc.integer({ min: 3, max: 28 }),
        (raw, cycle) => {
          const its = raw.map((r, i) => ({ surahId: i + 1, ayahCount: r.ayahCount, lastTouched: NOW - r.ago * DAY - 3600_000 }))
          const plan = planManzil(its, { cycleDays: cycle, now: NOW })
          for (const it of its) {
            expect(plan.scheduledDay[it.surahId]).toBeLessThanOrEqual(cycle)
          }
          // Surahs already revised today aren't scheduling decisions (their next date
          // is simply a cycle away) — only planned days carry load
          const perDay: Record<number, ManzilItem[]> = {}
          for (const it of its) {
            if (it.lastTouched >= TODAY) continue
            ;(perDay[plan.scheduledDay[it.surahId]] ??= []).push(it)
          }
          for (const dayItems of Object.values(perDay)) {
            const sum = dayItems.reduce((s, x) => s + x.ayahCount, 0)
            if (dayItems.length > 1) expect(sum).toBeLessThanOrEqual(plan.budget)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})

// ---------- leeches ----------

describe('leech detection', () => {
  it('ACCEPTANCE: an ayah failed 3 reviews in a row is flagged; a pass clears the streak', () => {
    let c = createNewCard(67, 14)
    for (let i = 0; i < 3; i++) c = processReview(c, 1)
    expect(c.failStreak).toBe(3)
    expect(c.lapses).toBe(3)
    expect(getLeeches([c, createNewCard(67, 15)])).toEqual([c])

    const passed = processReview(c, 4)
    expect(passed.failStreak).toBe(0)
    expect(passed.lapses).toBe(3) // history kept
    expect(getLeeches([passed])).toEqual([])
  })

  it('legacy cards without the fields are never leeches', () => {
    expect(getLeeches([createNewCard(1, 1)])).toEqual([])
  })

  it('lesson reviews track failures too', () => {
    const c = processLessonReview(card('1-1'), 2)
    expect(c.failStreak).toBe(1)
  })
})

describe('pre-release hardening (review findings)', () => {
  it('REGRESSION: the early-touch threshold is day-granular — no mid-day flip', () => {
    // Last touched Mon 18:00; on Thu the answer must be the same at 10:00 and 19:00
    const mon18 = new Date(2026, 8, 21, 18, 0).getTime()
    const thu10 = new Date(2026, 8, 24, 10, 0).getTime()
    const thu19 = new Date(2026, 8, 24, 19, 0).getTime()
    const c = card('1-1', { lastReview: mon18, nextReview: thu19 + 10 * DAY })
    const progress = { '1-1': { ...done('1-1', 0), completedAt: mon18 - DAY } }
    const morning = buildReviewQueue([c], progress, thu10)
    const evening = buildReviewQueue([c], progress, thu19)
    expect(morning.earlyIds.size).toBe(evening.earlyIds.size)
  })

  it('REGRESSION: a no-record card reviewed today still counts against the cap after leaving sabqi', () => {
    // It just reached 3 reps (now "manzil" by the youth fallback) — its touch must still count
    const reviewedToday = card('9-1', { repetitions: 3, lastReview: NOW - 1000, nextReview: TODAY + 7 * DAY })
    const stale = ['1-1', '1-2', '1-3', '1-4'].map((id) => card(id, { lastReview: NOW - 5 * DAY }))
    const progress = Object.fromEntries(['1-1', '1-2', '1-3', '1-4'].map((id) => [id, done(id, 7)]))
    const q = buildReviewQueue([reviewedToday, ...stale], progress, NOW)
    expect(q.earlyIds.size).toBe(RETENTION.SABQI_DAILY_CAP - 1)
  })

  it('REGRESSION: a surah revised "in the future" (clock skew) is not treated as revised today for days', () => {
    const its = items([20, 20], (i) => (i === 0 ? NOW + 3 * DAY : NOW - 20 * DAY))
    const plan = planManzil(its, { cycleDays: 7, now: NOW })
    expect(plan.today).toEqual([2]) // surah 1 isn't 'done today', so it can't eat today's budget
    expect(plan.scheduledDay[1]).toBeLessThanOrEqual(7)
    // …and it stays that way tomorrow (a plain clamp-to-now would re-count it daily)
    const tomorrow = planManzil(its, { cycleDays: 7, now: NOW + DAY })
    expect(tomorrow.scheduledDay[1]).not.toBe(7)
  })

  it('rest days carry no rotation work and no capacity', () => {
    const its = items(Array(6).fill(15), () => NOW - 30 * DAY)
    const todayDow = new Date(NOW).getDay()
    const restToday = planManzil(its, { cycleDays: 7, now: NOW, studyDays: [(todayDow + 1) % 7] })
    expect(restToday.today).toEqual([])
  })

  it('PROPERTY: with any study-day set, surahs land only on study days, by the first study day after due', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ ayahCount: fc.integer({ min: 3, max: 80 }), ago: fc.integer({ min: 1, max: 40 }) }), { minLength: 1, maxLength: 40 }),
        fc.integer({ min: 3, max: 21 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 }),
        (raw, cycle, studyDays) => {
          const its = raw.map((r, i) => ({ surahId: i + 1, ayahCount: r.ayahCount, lastTouched: NOW - r.ago * DAY - 3600_000 }))
          const plan = planManzil(its, { cycleDays: cycle, now: NOW, studyDays })
          for (const it of its) {
            const d = plan.scheduledDay[it.surahId]
            expect(studyDays).toContain(new Date(TODAY + d * DAY + 12 * 3600_000).getDay())
            expect(d).toBeLessThanOrEqual(cycle + 6)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
