import { describe, expect, it } from 'vitest';
import meta from '@/data/quran-meta.json';
import index from '@/data/search-index.json';
import { pageStrengths, toneOf } from './page-strength';
import type { ReviewCard } from '@/types/quran';

const starts = (meta as unknown as { page: [number, number][] }).page;
const counts = (index as { counts: number[] }).counts;
const NOW = 1_800_000_000_000;
const card = (surahId: number, ayahNumber: number, q: number, reviewed = true, overdue = false): ReviewCard => ({
  surahId, ayahNumber, easeFactor: 2.5, interval: 3, repetitions: 2,
  nextReview: overdue ? NOW - 5 * 86_400_000 : NOW + 86_400_000, lastReview: reviewed ? NOW - 86_400_000 : 0, lastQuality: q,
});

describe('pageStrengths', () => {
  it('counts every ayah on its page', () => {
    const pages = pageStrengths([], starts, counts, NOW);
    expect(pages).toHaveLength(604);
    expect(pages.reduce((n, p) => n + p.total, 0)).toBe(6236);
    expect(pages[0].total).toBe(7);
    expect(pages.every((p) => p.score === null)).toBe(true);
  });

  it('scores a page from its learned ayahs, overdue ones counting less', () => {
    const fatihah = Array.from({ length: 7 }, (_, i) => card(1, i + 1, 5));
    const [p1] = pageStrengths(fatihah, starts, counts, NOW);
    expect(p1).toMatchObject({ learned: 7, strong: 7, score: 1 });
    expect(toneOf(p1)).toBe('strong');
    const [late] = pageStrengths(fatihah.map((c) => ({ ...c, nextReview: NOW - 5 * 86_400_000 })), starts, counts, NOW);
    expect(late.score).toBeCloseTo(0.7);
    const [mixed] = pageStrengths([card(1, 1, 1), card(1, 2, 2)], starts, counts, NOW);
    expect(toneOf(mixed)).toBe('weak');
  });
});
