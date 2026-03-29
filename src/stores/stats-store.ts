'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserStats } from '@/types/quran';

interface LastActivity {
  type: 'lesson' | 'practice';
  url: string;
  label: string;
  timestamp: number;
}

interface StatsState extends UserStats {
  lastActivity: LastActivity | null;
  recordActivity: () => void;
  addAyahsMemorized: (count: number) => void;
  setLastActivity: (activity: LastActivity) => void;
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
      lastActiveDate: null,
      dailyActivities: 0,
      dailyActivityDate: null,
      lastActivity: null,

      recordActivity: () =>
        set((state) => {
          const today = getToday();
          const isNewDay = state.lastActiveDate !== today;

          // Always increment daily activities (reset if new day)
          const dailyActivities = isNewDay ? 1 : state.dailyActivities + 1;

          // Streak only updates on first activity of the day
          if (!isNewDay) {
            return { dailyActivities, dailyActivityDate: today };
          }

          const yesterday = getYesterday();
          const newStreak =
            state.lastActiveDate === yesterday
              ? state.currentStreak + 1
              : 1;

          return {
            currentStreak: newStreak,
            longestStreak: Math.max(state.longestStreak, newStreak),
            lastActiveDate: today,
            dailyActivities,
            dailyActivityDate: today,
          };
        }),

      addAyahsMemorized: (count) =>
        set((state) => ({
          totalAyahsMemorized: state.totalAyahsMemorized + count,
        })),

      setLastActivity: (activity) => set({ lastActivity: activity }),
    }),
    {
      name: 'quran-stats',
      version: 1,
      migrate: (persisted: any, version: number) => {
        if (version === 0) {
          // Remove old totalMinutesLearned, add new daily tracking fields
          delete persisted.totalMinutesLearned;
          persisted.dailyActivities = 0;
          persisted.dailyActivityDate = null;
        }
        return persisted;
      },
    }
  )
);
