'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReviewCard } from '@/types/quran';
import { createNewCard, processReview, getDueCards } from '@/lib/spaced-repetition';

interface ReviewState {
  cards: ReviewCard[];
  addCard: (surahId: number, ayahNumber: number) => void;
  addCardsForSurah: (surahId: number, ayahCount: number) => void;
  reviewCard: (surahId: number, ayahNumber: number, quality: number) => void;
  getDueCards: () => ReviewCard[];
  getDueCount: () => number;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      cards: [],

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
    }),
    { name: 'quran-reviews' }
  )
);
