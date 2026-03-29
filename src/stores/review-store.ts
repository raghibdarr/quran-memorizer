'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReviewCard, LessonReviewCard, LessonDef } from '@/types/quran';
import { createNewCard, processReview, getDueCards, createLessonReviewCard, processLessonReview, getDueLessonCards } from '@/lib/spaced-repetition';

interface ReviewState {
  // Ayah-level cards (existing, used for health analytics)
  cards: ReviewCard[];
  addCard: (surahId: number, ayahNumber: number) => void;
  addCardsForSurah: (surahId: number, ayahCount: number) => void;
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

      reviewCard: (surahId, ayahNumber, quality) =>
        set((state) => ({
          cards: state.cards.map((c) =>
            c.surahId === surahId && c.ayahNumber === ayahNumber
              ? processReview(c, quality)
              : c
          ),
        })),

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
    { name: 'quran-reviews' }
  )
);

