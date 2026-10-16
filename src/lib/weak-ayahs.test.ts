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

describe('recurring weak spots', () => {
  it('lists ayahs slipped twice or more, most slips first, then most recent', async () => {
    const { getWeakSpots } = await import('./retention');
    const spots = getWeakSpots([
      card(1, { lapses: 1, misses: [5] }),
      card(2, { lapses: 3, misses: [1, 2, 3] }),
      card(3, { lapses: 2, misses: [8, 9] }),
      card(4, { lapses: 2, misses: [1, 2] }),
    ]);
    expect(spots.map((c) => c.ayahNumber)).toEqual([2, 3, 4]);
  });

  it('records when a review fails, capped at the last ten', async () => {
    const { processReview, MISS_LOG_SIZE } = await import('./spaced-repetition');
    let c = card(1);
    for (let i = 0; i < 12; i++) c = processReview(c, 1);
    expect(c.misses).toHaveLength(MISS_LOG_SIZE);
    expect(processReview(c, 5).misses).toEqual(c.misses); // a pass keeps the log
  });
});
