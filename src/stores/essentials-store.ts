'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface EssentialsState {
  memorized: Record<string, boolean>;
  counters: Record<string, number>;
  toggleMemorized: (itemId: string) => void;
  incrementCounter: (itemId: string) => void;
  resetCounter: (itemId: string) => void;
}

export const useEssentialsStore = create<EssentialsState>()(
  persist(
    (set) => ({
      memorized: {},
      counters: {},

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
    }),
    { name: 'quran-essentials' }
  )
);
