import { describe, expect, it } from 'vitest';
import { upcoming } from './upcoming';
import { addLocalDays, startOfDayMs } from './dates';

describe('upcoming', () => {
  it('buckets reviews by local day, overdue into today', () => {
    const now = new Date(2026, 9, 16, 15, 0).getTime();
    const day = (n: number) => addLocalDays(startOfDayMs(now), n);
    const days = upcoming(
      [{ nextReview: day(-3) }, { nextReview: day(1) }, { nextReview: day(1) }, { nextReview: day(30) }],
      [{ nextReview: day(0) }, { nextReview: day(6) }],
      now,
    );
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ lessons: 1, ayahs: 1 });
    expect(days[1]).toMatchObject({ lessons: 2, ayahs: 0 });
    expect(days[6]).toMatchObject({ lessons: 0, ayahs: 1 });
  });
});
