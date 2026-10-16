import { describe, expect, it } from 'vitest';
import { ayahInk } from './memory-ink';
import type { ReviewCard } from '@/types/quran';

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 17);
const card = (over: Partial<ReviewCard>): ReviewCard => ({
  surahId: 1, ayahNumber: 1, easeFactor: 2.5, interval: 10, repetitions: 3,
  nextReview: now + 5 * DAY, lastReview: now - 5 * DAY, lastQuality: 5, ...over,
});

describe('ayahInk', () => {
  it('prints a strong, on-schedule ayah in full ink', () => {
    expect(ayahInk(card({}), now)).toBe(1);
  });
  it('fades shaky and weak ayahs, keeping them above the not-learned ink', () => {
    const shaky = ayahInk(card({ lastQuality: 3 }), now);
    const weak = ayahInk(card({ lastQuality: 1 }), now);
    const none = ayahInk(undefined, now);
    expect(shaky).toBeLessThan(1);
    expect(weak).toBeLessThan(shaky);
    expect(none).toBeLessThan(weak);
  });
  it('fades an overdue ayah, more so the later it is', () => {
    const onTime = ayahInk(card({}), now);
    const dayLate = ayahInk(card({ nextReview: now - 2 * DAY }), now);
    const longLate = ayahInk(card({ nextReview: now - 30 * DAY }), now);
    expect(dayLate).toBeLessThan(onTime);
    expect(longLate).toBeLessThan(dayLate);
  });
  it('treats an attested-but-unchecked ayah as half held', () => {
    expect(ayahInk(card({ lastReview: 0 }), now)).toBeCloseTo(0.22 + 0.78 * 0.55, 2);
  });
});
