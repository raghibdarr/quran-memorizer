import { describe, expect, it } from 'vitest'
import { todayIso, yesterdayIso, startOfTodayMs, startOfDayMs } from './dates'
import { processLessonReview, processReview, createNewCard, createLessonReviewCard, isDue } from './spaced-repetition'
import type { LessonReviewCard } from '@/types/quran'

describe('local date helpers', () => {
  it('todayIso is a local date, not UTC', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(todayIso()).toBe(expected)
  })

  it('yesterdayIso is exactly one calendar day before todayIso', () => {
    const today = new Date(todayIso() + 'T00:00:00')
    const yesterday = new Date(yesterdayIso() + 'T00:00:00')
    expect(today.getTime() - yesterday.getTime()).toBe(86_400_000)
  })

  it('startOfDayMs truncates to local midnight', () => {
    const d = new Date(startOfDayMs(Date.now()))
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0])
    expect(startOfDayMs(Date.now())).toBe(startOfTodayMs())
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
    expect(updated.nextReview).toBe(startOfDayMs(Date.now() + updated.interval * 86_400_000))
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
