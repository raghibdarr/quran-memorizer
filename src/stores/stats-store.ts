'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserStats } from '@/types/quran';

interface StatsState extends UserStats {
  recordActivity: () => void;
  addAyahsMemorized: (count: number) => void;
  addMinutesLearned: (minutes: number) => void;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export const useStatsStore = create<StatsState>()(
  persist(
    (set) => ({
      currentStreak: 0,
      longestStreak: 0,
      totalAyahsMemorized: 0,
      totalMinutesLearned: 0,
      lastActiveDate: null,

      recordActivity: () =>
        set((state) => {
          const today = getToday();
          if (state.lastActiveDate === today) return state;

          const yesterday = getYesterday();
          const newStreak =
            state.lastActiveDate === yesterday
              ? state.currentStreak + 1
              : 1;

          return {
            currentStreak: newStreak,
            longestStreak: Math.max(state.longestStreak, newStreak),
            lastActiveDate: today,
          };
        }),

      addAyahsMemorized: (count) =>
        set((state) => ({
          totalAyahsMemorized: state.totalAyahsMemorized + count,
        })),

      addMinutesLearned: (minutes) =>
        set((state) => ({
          totalMinutesLearned: state.totalMinutesLearned + minutes,
        })),
    }),
    { name: 'quran-stats' }
  )
);
