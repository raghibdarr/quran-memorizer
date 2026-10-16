import { describe, expect, it } from 'vitest';
import { getWeakAyahs } from './retention';
import type { ReviewCard } from '@/types/quran';

const card = (ayahNumber: number, over: Partial<ReviewCard> = {}): ReviewCard => ({
  surahId: 2, ayahNumber, easeFactor: 2.5, interval: 1, repetitions: 1, nextReview: 0, lastReview: 1000, lastQuality: 5, ...over,
});

describe('the weakest-ayah drill', () => {
  it('puts leeches first, then last-time misses, then shaky, then frequent slips', () => {
    const cards = [
      card(1),                                    // fine
      card(2, { lastQuality: 3 }),                // shaky last time
      card(3, { failStreak: 3, lastQuality: 1 }), // leech
      card(4, { lastQuality: 1, failStreak: 1 }), // missed last time
      card(5, { lapses: 2 }),                     // slipped before, fine now
    ];
    expect(getWeakAyahs(cards).map((c) => c.ayahNumber)).toEqual([3, 4, 2, 5]);
  });

  it('ignores ayahs never rated (seeded as known) and caps the session', () => {
    expect(getWeakAyahs([card(1, { lastReview: 0, lastQuality: 0 })])).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => card(i + 1, { lastQuality: 1 }));
    expect(getWeakAyahs(many)).toHaveLength(8);
  });
});
