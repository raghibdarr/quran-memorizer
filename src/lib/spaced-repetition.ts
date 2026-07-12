import type { ReviewCard, LessonReviewCard, LessonDef } from '@/types/quran';
import { startOfDayMs } from './dates';

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

/**
 * Card for an ayah the user attests to already knowing (M4 "known = tracked").
 * Conservative "shaky" strength — lastQuality 3 renders as shaky in the health
 * dashboard, never strong — and due dates staggered across the next 7 days by
 * `stagger` (ayah index) so marking a whole juz known doesn't dump every ayah
 * into one session. An honest rating on first real recall recalibrates it.
 */
export function createSeededCard(surahId: number, ayahNumber: number, stagger = 0): ReviewCard {
  return {
    surahId,
    ayahNumber,
    easeFactor: 2.3,
    interval: 3,
    repetitions: 1,
    nextReview: startOfDayMs(Date.now() + (1 + (stagger % 7)) * DAY_MS),
    lastReview: 0, // never actually reviewed — a real review always wins the sync merge
    lastQuality: 3,
  };
}

export function createLessonReviewCard(lessonDef: LessonDef, surahId: number, dueNow = false): LessonReviewCard {
  return {
    lessonId: lessonDef.lessonId,
    surahId,
    lessonNumber: lessonDef.lessonNumber,
    ayahStart: lessonDef.ayahStart,
    ayahEnd: lessonDef.ayahEnd,
    easeFactor: 2.5,
    interval: dueNow ? 0 : 1,
    repetitions: 0,
    // Due dates are LOCAL START-OF-DAY: a card due "tomorrow" is due from midnight,
    // not from this exact clock time tomorrow (which made "done today" un-complete
    // itself when a card matured mid-day after the user's session).
    nextReview: dueNow ? Date.now() : startOfDayMs(Date.now() + DAY_MS),
    lastReview: 0,
    lastQuality: 0,
  };
}

// The one SM-2 core shared by ayah- and lesson-level cards (deduped in M2 —
// the two copies had already started to drift risk).
interface Sm2Fields {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReview: number;
  lastQuality: number;
}

function applySm2<T extends Sm2Fields>(card: T, quality: number): T {
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
  // Due dates are LOCAL START-OF-DAY (see dates.ts) — cards mature at midnight
  updated.nextReview = startOfDayMs(Date.now() + updated.interval * DAY_MS);

  return updated;
}

export function processReview(card: ReviewCard, quality: number): ReviewCard {
  return applySm2(card, quality);
}

export function processLessonReview(card: LessonReviewCard, quality: number): LessonReviewCard {
  return applySm2(card, quality);
}

export function isDue(card: ReviewCard | LessonReviewCard): boolean {
  return card.nextReview <= Date.now();
}

function dueSorted<T extends { nextReview: number }>(cards: T[]): T[] {
  return cards
    .filter((c) => c.nextReview <= Date.now())
    .sort((a, b) => a.nextReview - b.nextReview);
}

export function getDueCards(cards: ReviewCard[]): ReviewCard[] {
  return dueSorted(cards);
}

export function getDueLessonCards(cards: LessonReviewCard[]): LessonReviewCard[] {
  return dueSorted(cards);
}
