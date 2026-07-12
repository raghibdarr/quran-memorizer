'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayIso, yesterdayIso } from '@/lib/dates';
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

// Day boundaries are LOCAL (src/lib/dates.ts) — the old toISOString() versions
// flipped the day at UTC midnight, disagreeing with the plan's local dates
// (evening activity could count toward "tomorrow" and silently break streaks).
const getToday = todayIso;
const getYesterday = yesterdayIso;

export const useStatsStore = create<StatsState>()(
  persist(
    (set) => ({
      currentStreak: 0,
      longestStreak: 0,
      totalAyahsMemorized: 0,
      lastActiveDate: null,
      dailyActivities: 0,
      dailyActivityDate: null,
      activityLog: {},
      lastActivity: null,

      recordActivity: () =>
        set((state) => {
          const today = getToday();
          const isNewDay = state.lastActiveDate !== today;

          // Always increment daily activities (reset if new day)
          const dailyActivities = isNewDay ? 1 : state.dailyActivities + 1;

          // Update activity log for heatmap
          const activityLog = { ...state.activityLog };
          activityLog[today] = (activityLog[today] ?? 0) + 1;

          // Streak only updates on first activity of the day
          if (!isNewDay) {
            return { dailyActivities, dailyActivityDate: today, activityLog };
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
            activityLog,
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
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version === 0) {
          delete persisted.totalMinutesLearned;
          persisted.dailyActivities = 0;
          persisted.dailyActivityDate = null;
          persisted.activityLog = {};
        }
        if (version <= 1) {
          persisted.activityLog = {};
          // Seed from existing dailyActivities if present
          if (persisted.dailyActivityDate && persisted.dailyActivities > 0) {
            persisted.activityLog[persisted.dailyActivityDate] = persisted.dailyActivities;
          }
        }
        return persisted;
      },
    }
  )
);
