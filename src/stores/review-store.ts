'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReviewCard, LessonReviewCard, LessonDef } from '@/types/quran';
import { createNewCard, createSeededCard, processReview, getDueCards, createLessonReviewCard, processLessonReview, getDueLessonCards } from '@/lib/spaced-repetition';
import { startOfDayMs } from '@/lib/dates';

/** Exported for migration tests. v2 truncates stored due times to the LOCAL
 *  start of day (M3): cards scheduled before the SM-2 day-truncation fix carry
 *  arbitrary times of day, so a card reviewed at 8pm would only mature at 8pm —
 *  truncating matures everything at local midnight (always in the user's favor). */
export function migrateReviews(persisted: any, version: number) {
  if (version <= 1) {
    const truncate = (c: any) => ({ ...c, nextReview: startOfDayMs(c.nextReview ?? 0) });
    persisted.cards = (persisted.cards ?? []).map(truncate);
    persisted.lessonCards = (persisted.lessonCards ?? []).map(truncate);
  }
  return persisted;
}

interface ReviewState {
  // Ayah-level cards (existing, used for health analytics)
  cards: ReviewCard[];
  addCard: (surahId: number, ayahNumber: number) => void;
  addCardsForSurah: (surahId: number, ayahCount: number) => void;
  /** Seed shaky-strength cards for an attested-known ayah range (M4). Existing
   *  cards are never overwritten — a real rating always outranks an attestation. */
  seedKnownAyahs: (surahId: number, ayahStart: number, ayahEnd: number) => void;
  reviewCard: (surahId: number, ayahNumber: number, quality: number) => void;
  getDueCards: () => ReviewCard[];
  getDueCount: () => number;

  // Lesson-level cards (new, used for spaced review sessions)
  lessonCards: LessonReviewCard[];
  addLessonCard: (lessonDef: LessonDef, surahId: number, dueNow?: boolean) => void;
  reviewLessonCard: (lessonId: string, quality: number) => void;
  getDueLessonCards: () => LessonReviewCard[];
  getDueLessonCount: () => number;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      cards: [],
      lessonCards: [],

      addCard: (surahId, ayahNumber) =>
        set((state) => {
          const exists = state.cards.some(
            (c) => c.surahId === surahId && c.ayahNumber === ayahNumber
          );
          if (exists) return state;
          return { cards: [...state.cards, createNewCard(surahId, ayahNumber)] };
        }),

      addCardsForSurah: (surahId, ayahCount) =>
        set((state) => {
          const newCards = [...state.cards];
          for (let i = 1; i <= ayahCount; i++) {
            const exists = newCards.some(
              (c) => c.surahId === surahId && c.ayahNumber === i
            );
            if (!exists) {
              newCards.push(createNewCard(surahId, i));
            }
          }
          return { cards: newCards };
        }),

      seedKnownAyahs: (surahId, ayahStart, ayahEnd) =>
        set((state) => {
          const existing = new Set(state.cards.map((c) => `${c.surahId}:${c.ayahNumber}`));
          const seeded: typeof state.cards = [];
          for (let n = ayahStart; n <= ayahEnd; n++) {
            if (!existing.has(`${surahId}:${n}`)) {
              seeded.push(createSeededCard(surahId, n, n - ayahStart));
            }
          }
          return seeded.length > 0 ? { cards: [...state.cards, ...seeded] } : state;
        }),

      reviewCard: (surahId, ayahNumber, quality) =>
        set((state) => {
          const exists = state.cards.some((c) => c.surahId === surahId && c.ayahNumber === ayahNumber);
          if (exists) {
            return {
              cards: state.cards.map((c) =>
                c.surahId === surahId && c.ayahNumber === ayahNumber
                  ? processReview(c, quality)
                  : c
              ),
            };
          }
          // Create new card if it doesn't exist (e.g. from practice mode)
          const newCard = processReview(createNewCard(surahId, ayahNumber), quality);
          return { cards: [...state.cards, newCard] };
        }),

      getDueCards: () => getDueCards(get().cards),

      getDueCount: () => getDueCards(get().cards).length,

      // Lesson-level methods
      addLessonCard: (lessonDef, surahId, dueNow = false) =>
        set((state) => {
          const exists = state.lessonCards.some((c) => c.lessonId === lessonDef.lessonId);
          if (exists) return state;
          return { lessonCards: [...state.lessonCards, createLessonReviewCard(lessonDef, surahId, dueNow)] };
        }),

      reviewLessonCard: (lessonId, quality) =>
        set((state) => ({
          lessonCards: state.lessonCards.map((c) =>
            c.lessonId === lessonId
              ? processLessonReview(c, quality)
              : c
          ),
        })),

      getDueLessonCards: () => getDueLessonCards(get().lessonCards),

      getDueLessonCount: () => getDueLessonCards(get().lessonCards).length,
    }),
    { name: 'quran-reviews', version: 2, migrate: migrateReviews }
  )
);

