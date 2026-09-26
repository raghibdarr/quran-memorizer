import { describe, expect, it } from 'vitest';
import type { LessonDef, ReviewCard } from '@/types/quran';
import { computeSurahHealth } from './review-helpers';
import { createSeededCard } from './spaced-repetition';

const lesson: LessonDef = { lessonId: '112-1', surahId: 112, lessonNumber: 1, ayahStart: 1, ayahEnd: 4, ayahCount: 4, juzNumber: 30 };
const rated = (ayahNumber: number, lastQuality: number): ReviewCard => ({
  surahId: 112, ayahNumber, easeFactor: 2.5, interval: 3, repetitions: 1, nextReview: 0, lastReview: 1_700_000_000_000, lastQuality,
});

describe('computeSurahHealth', () => {
  it('attested-known ayahs read as "not checked yet", never as a guessed strength', () => {
    const h = computeSurahHealth(112, [lesson], [1, 2, 3, 4].map((n) => createSeededCard(112, n)));
    expect(h.totalUnchecked).toBe(4);
    expect(h.totalHesitant).toBe(0);
    expect(h.needsAttention).toBe(false);
  });

  it('a real rating decides the health', () => {
    const h = computeSurahHealth(112, [lesson], [rated(1, 5), rated(2, 3), rated(3, 1), createSeededCard(112, 4)]);
    expect([h.totalStrong, h.totalHesitant, h.totalWeak, h.totalUnchecked, h.totalNotLearned]).toEqual([1, 1, 1, 1, 0]);
    expect(h.needsAttention).toBe(true);
  });
});
