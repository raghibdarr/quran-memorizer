import type { ReviewCard } from '@/types/quran';

const MIN_EASE_FACTOR = 1.3;
const DAY_MS = 86_400_000;

export function createNewCard(surahId: number, ayahNumber: number): ReviewCard {
  return {
    surahId,
    ayahNumber,
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: Date.now(),
    lastReview: 0,
    lastQuality: 0,
  };
}

export function processReview(card: ReviewCard, quality: number): ReviewCard {
  const updated = { ...card };

  if (quality < 3) {
    updated.repetitions = 0;
    updated.interval = 1;
  } else {
    if (updated.repetitions === 0) {
      updated.interval = 1;
    } else if (updated.repetitions === 1) {
      updated.interval = 3;
    } else if (updated.repetitions === 2) {
      updated.interval = 7;
    } else {
      updated.interval = Math.round(updated.interval * updated.easeFactor);
    }
    updated.repetitions += 1;
  }

  updated.easeFactor = Math.max(
    MIN_EASE_FACTOR,
    updated.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  updated.lastReview = Date.now();
  updated.lastQuality = quality;
  updated.nextReview = Date.now() + updated.interval * DAY_MS;

  return updated;
}

export function isDue(card: ReviewCard): boolean {
  return card.nextReview <= Date.now();
}

export function getDueCards(cards: ReviewCard[]): ReviewCard[] {
  return cards
    .filter(isDue)
    .sort((a, b) => a.nextReview - b.nextReview);
}
