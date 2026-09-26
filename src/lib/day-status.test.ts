import { describe, expect, it } from 'vitest'
import { activityDayStatus, planDayStatus, shouldCelebrateDay } from './day-status'
import { startOfDayMs } from './dates'
import type { LessonDef, LessonReviewCard, SurahRevisionTask, TodaysPlan } from '@/types/quran'

const NOW = new Date(2026, 8, 26, 18, 0).getTime()
const TODAY = startOfDayMs(NOW)
const DAY = 86_400_000

const lesson = (id: string): LessonDef => {
  const [s, l] = id.split('-').map(Number)
  return { lessonId: id, surahId: s, lessonNumber: l, ayahStart: 1, ayahEnd: 5, ayahCount: 5, juzNumber: 30 }
}
const card = (id: string, lastReview: number): LessonReviewCard => {
  const [s, l] = id.split('-').map(Number)
  return { lessonId: id, surahId: s, lessonNumber: l, ayahStart: 1, ayahEnd: 5, easeFactor: 2.5, interval: 3, repetitions: 2, nextReview: NOW + 3 * DAY, lastReview, lastQuality: 4 }
}
const revision = (surahId: number): SurahRevisionTask => ({
  surahId, surahName: `S${surahId}`, lastRevised: null, daysSinceRevision: 9, isPartial: false, ayahStart: 1, ayahEnd: 5, totalAyahsInSurah: 5,
})
function plan(o: Partial<TodaysPlan> = {}): TodaysPlan {
  return {
    date: '2026-09-26', reviews: [], sabqi: [], manzil: [], earlyReviewIds: [], overdueReviewCount: 0, deferredReviewCount: 0,
    revisions: [], newLessons: [], isRestDay: false, isComplete: false, completedNewLessonIds: [], ...o,
  }
}

describe('planDayStatus — the one "done today"', () => {
  it('counts each review, revision and new lesson individually', () => {
    const tp = plan({
      reviews: [card('1-1', 0), card('1-2', 0)],
      revisions: [revision(78)],
      newLessons: [lesson('2-1'), lesson('2-2')],
      completedNewLessonIds: ['2-1'],
    })
    const s = planDayStatus(tp, [card('3-1', TODAY + 1000)], { 79: TODAY + 5000 }, NOW)
    // done: 1 review + 1 revision + 1 lesson; remaining: 2 reviews + 1 revision + 1 lesson
    expect(s).toMatchObject({ done: 3, remaining: 4, total: 7, complete: false })
  })

  it('complete once nothing remains and something was scheduled', () => {
    const tp = plan({ newLessons: [lesson('2-1')], completedNewLessonIds: ['2-1'] })
    expect(planDayStatus(tp, [], {}, NOW).complete).toBe(true)
  })

  it('an empty day (nothing scheduled, nothing done) is NOT complete', () => {
    expect(planDayStatus(plan({ isRestDay: true }), [], {}, NOW).complete).toBe(false)
  })

  it('yesterday\'s reviews do not count toward today', () => {
    const s = planDayStatus(plan(), [card('1-1', TODAY - 1)], { 5: TODAY - 1 }, NOW)
    expect(s.done).toBe(0)
  })
})

describe('activityDayStatus — planless fallback', () => {
  it('fills toward the daily goal and caps there', () => {
    expect(activityDayStatus(1, 2)).toMatchObject({ done: 1, total: 2, complete: false })
    expect(activityDayStatus(5, 2)).toMatchObject({ done: 2, total: 2, remaining: 0, complete: true })
  })
})

describe('shouldCelebrateDay', () => {
  const complete = planDayStatus(plan({ newLessons: [lesson('2-1')], completedNewLessonIds: ['2-1'] }), [], {}, NOW)

  it('ACCEPTANCE: fires exactly once per day (replay-guarded by date)', () => {
    expect(shouldCelebrateDay(complete, { todayIso: '2026-09-26', celebratedOn: null, activitiesToday: 1 })).toBe(true)
    expect(shouldCelebrateDay(complete, { todayIso: '2026-09-26', celebratedOn: '2026-09-26', activitiesToday: 3 })).toBe(false)
    expect(shouldCelebrateDay(complete, { todayIso: '2026-09-27', celebratedOn: '2026-09-26', activitiesToday: 1 })).toBe(true)
  })

  it('never fires without real work today (e.g. only marking surahs known)', () => {
    const onlyKnown = planDayStatus(plan(), [], { 78: TODAY + 1000 }, NOW)
    expect(onlyKnown.complete).toBe(true)
    expect(shouldCelebrateDay(onlyKnown, { todayIso: '2026-09-26', celebratedOn: null, activitiesToday: 0 })).toBe(false)
  })

  it('never fires for planless users', () => {
    expect(shouldCelebrateDay(activityDayStatus(3, 2), { todayIso: '2026-09-26', celebratedOn: null, activitiesToday: 3 })).toBe(false)
  })
})
