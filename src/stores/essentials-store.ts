'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface EssentialsState {
  memorized: Record<string, boolean>;
  counters: Record<string, number>;
  favorites: Record<string, boolean>;
  toggleMemorized: (itemId: string) => void;
  incrementCounter: (itemId: string) => void;
  resetCounter: (itemId: string) => void;
  toggleFavorite: (itemId: string) => void;
}

export const useEssentialsStore = create<EssentialsState>()(
  persist(
    (set) => ({
      memorized: {},
      counters: {},
      favorites: {},

      toggleMemorized: (itemId) =>
        set((state) => ({
          memorized: { ...state.memorized, [itemId]: !state.memorized[itemId] },
        })),

      incrementCounter: (itemId) =>
        set((state) => ({
          counters: { ...state.counters, [itemId]: (state.counters[itemId] ?? 0) + 1 },
        })),

      resetCounter: (itemId) =>
        set((state) => ({
          counters: { ...state.counters, [itemId]: 0 },
        })),

      toggleFavorite: (itemId) =>
        set((state) => ({
          favorites: { ...state.favorites, [itemId]: !state.favorites[itemId] },
        })),
    }),
    // version + passthrough migrate: zustand DISCARDS persisted state on a version
    // mismatch without a migrate fn — every store must carry both (M2)
    { name: 'quran-essentials', version: 1, migrate: (p) => p as never }
  )
);
