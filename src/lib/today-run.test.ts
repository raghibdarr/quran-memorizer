import { describe, expect, it } from 'vitest';
import type { LessonDef, LessonReviewCard, SurahRevisionTask, TodaysPlan } from '@/types/quran';
import { estimateTodaySeconds, nextTodayHref } from './today-run';

const card = (lessonId: string): LessonReviewCard => ({
  lessonId, surahId: 112, lessonNumber: 1, ayahStart: 1, ayahEnd: 4,
  easeFactor: 2.5, interval: 3, repetitions: 2, nextReview: 0, lastReview: 1, lastQuality: 4,
});
const lesson: LessonDef = { lessonId: '1-1', surahId: 1, lessonNumber: 1, ayahStart: 1, ayahEnd: 7, ayahCount: 7, juzNumber: 1 };
const revision = { surahId: 113, surahName: 'Al-Falaq', ayahStart: 1, ayahEnd: 5 } as SurahRevisionTask;
const plan = (over: Partial<TodaysPlan> = {}): TodaysPlan => ({
  date: '2026-09-27', reviews: [], sabqi: [], manzil: [], earlyReviewIds: [], overdueReviewCount: 0,
  deferredReviewCount: 0, revisions: [], newLessons: [], isRestDay: false, isComplete: false,
  completedNewLessonIds: [], ...over,
});

describe('today run', () => {
  it('goes reviews → revisions → new lesson, then stops', () => {
    expect(nextTodayHref(plan({ reviews: [card('112-1')], revisions: [revision], newLessons: [lesson] }))).toBe('/review/session?from=today');
    expect(nextTodayHref(plan({ revisions: [revision], newLessons: [lesson] }))).toBe('/plan/revise/113?from=today');
    expect(nextTodayHref(plan({ newLessons: [lesson] }))).toBe('/learn?s=1&l=1');
    expect(nextTodayHref(plan({ newLessons: [lesson], completedNewLessonIds: ['1-1'] }))).toBeNull();
  });

  it('estimates reviews in minutes and a new lesson in tens of minutes', () => {
    const reviewsOnly = estimateTodaySeconds(plan({ reviews: [card('a'), card('b')] })) / 60;
    expect(reviewsOnly).toBeGreaterThan(0.5);
    expect(reviewsOnly).toBeLessThan(3);
    expect(estimateTodaySeconds(plan({ newLessons: [lesson] })) / 60).toBeGreaterThan(25);
  });
});
