import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonDef, LessonReviewCard, ReviewCard } from '@/types/quran';
import {
  createLessonReviewCard,
  createNewCard,
  getDueCards,
  getDueLessonCards,
  isDue,
  processLessonReview,
  processReview,
} from './spaced-repetition';

const DAY = 86_400_000;
const NOW = new Date('2026-05-25T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const lessonDef = (overrides: Partial<LessonDef> = {}): LessonDef => ({
  lessonId: '1-1',
  surahId: 1,
  lessonNumber: 1,
  ayahStart: 1,
  ayahEnd: 7,
  ayahCount: 7,
  juzNumber: 1,
  ...overrides,
});

describe('createNewCard', () => {
  it('uses default ease factor 2.5 and zero interval/repetitions', () => {
    const c = createNewCard(1, 1);
    expect(c).toMatchObject({
      surahId: 1,
      ayahNumber: 1,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      lastReview: 0,
      lastQuality: 0,
    });
    expect(c.nextReview).toBe(NOW);
  });
});

describe('createLessonReviewCard', () => {
  it('schedules 1 day out by default', () => {
    const c = createLessonReviewCard(lessonDef(), 1);
    expect(c.interval).toBe(1);
    expect(c.nextReview).toBe(NOW + DAY);
  });

  it('schedules immediately when dueNow=true', () => {
    const c = createLessonReviewCard(lessonDef(), 1, true);
    expect(c.interval).toBe(0);
    expect(c.nextReview).toBe(NOW);
  });
});

describe('processReview — quality < 3 (failure)', () => {
  it('resets repetitions and sets interval to 1 day', () => {
    const card = { ...createNewCard(1, 1), repetitions: 5, interval: 30, easeFactor: 2.8 };
    const out = processReview(card, 2);
    expect(out.repetitions).toBe(0);
    expect(out.interval).toBe(1);
    expect(out.nextReview).toBe(NOW + DAY);
    expect(out.lastQuality).toBe(2);
  });

  it('still decreases easeFactor on failure', () => {
    const card = { ...createNewCard(1, 1), easeFactor: 2.5 };
    const out = processReview(card, 0);
    expect(out.easeFactor).toBeLessThan(2.5);
    expect(out.easeFactor).toBeGreaterThanOrEqual(1.3); // floor
  });

  it('clamps easeFactor at the 1.3 floor under repeated failures', () => {
    let card = createNewCard(1, 1);
    for (let i = 0; i < 20; i++) card = processReview(card, 0);
    expect(card.easeFactor).toBe(1.3);
  });
});

describe('processReview — quality >= 3 (pass)', () => {
  it('first review (reps=0) sets interval to 1', () => {
    const out = processReview(createNewCard(1, 1), 4);
    expect(out.repetitions).toBe(1);
    expect(out.interval).toBe(1);
  });

  it('second review (reps=1) sets interval to 3', () => {
    let card = processReview(createNewCard(1, 1), 4);
    card = processReview(card, 4);
    expect(card.repetitions).toBe(2);
    expect(card.interval).toBe(3);
  });

  it('third review (reps=2) sets interval to 7', () => {
    let card = createNewCard(1, 1);
    for (let i = 0; i < 3; i++) card = processReview(card, 4);
    expect(card.repetitions).toBe(3);
    expect(card.interval).toBe(7);
  });

  it('fourth+ reviews multiply interval by easeFactor', () => {
    let card = createNewCard(1, 1);
    for (let i = 0; i < 3; i++) card = processReview(card, 4);
    const before = card.interval; // 7
    const ef = card.easeFactor;
    card = processReview(card, 4);
    expect(card.interval).toBe(Math.round(before * ef));
  });

  it('quality 5 (perfect) increases easeFactor', () => {
    const card = createNewCard(1, 1);
    const out = processReview(card, 5);
    expect(out.easeFactor).toBeGreaterThan(2.5);
  });

  it('quality 3 (barely passed) decreases easeFactor slightly', () => {
    const card = createNewCard(1, 1);
    const out = processReview(card, 3);
    expect(out.easeFactor).toBeLessThan(2.5);
  });
});

describe('processLessonReview', () => {
  it('uses the same SM-2 logic as ayah-level reviews', () => {
    const lc = createLessonReviewCard(lessonDef(), 1);
    const out = processLessonReview(lc, 4);
    expect(out.repetitions).toBe(1);
    expect(out.interval).toBe(1);
    expect(out.nextReview).toBe(NOW + DAY);
  });

  it('failure path resets repetitions on lesson cards too', () => {
    const lc: LessonReviewCard = { ...createLessonReviewCard(lessonDef(), 1), repetitions: 4, interval: 21 };
    const out = processLessonReview(lc, 1);
    expect(out.repetitions).toBe(0);
    expect(out.interval).toBe(1);
  });
});

describe('isDue / getDueCards', () => {
  it('isDue returns true when nextReview <= now', () => {
    const past: ReviewCard = { ...createNewCard(1, 1), nextReview: NOW - 1 };
    const future: ReviewCard = { ...createNewCard(1, 1), nextReview: NOW + 1 };
    expect(isDue(past)).toBe(true);
    expect(isDue(future)).toBe(false);
  });

  it('getDueCards returns due cards sorted by nextReview ascending', () => {
    const a: ReviewCard = { ...createNewCard(1, 1), nextReview: NOW - 100 };
    const b: ReviewCard = { ...createNewCard(1, 2), nextReview: NOW - 200 };
    const c: ReviewCard = { ...createNewCard(1, 3), nextReview: NOW + 100 };
    const due = getDueCards([a, b, c]);
    expect(due.map((d) => d.ayahNumber)).toEqual([2, 1]); // earliest nextReview first
  });

  it('getDueLessonCards mirrors getDueCards for lessons', () => {
    const a = createLessonReviewCard(lessonDef({ lessonId: '1-1' }), 1, true);
    const b = createLessonReviewCard(lessonDef({ lessonId: '1-2', lessonNumber: 2 }), 1, false);
    const due = getDueLessonCards([a, b]);
    expect(due).toHaveLength(1);
    expect(due[0].lessonId).toBe('1-1');
  });
});
