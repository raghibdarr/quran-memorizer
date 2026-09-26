'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayIso } from '@/lib/dates';
import { recordActiveDay, reconcileStreak, ALL_DAYS, type StreakFields } from '@/lib/streak';
import { detectLapse, reentryDay, type Reentry } from '@/lib/recovery';
import { usePlanStore } from '@/stores/plan-store';
import type { UserStats } from '@/types/quran';

interface LastActivity {
  type: 'lesson' | 'practice';
  url: string;
  label: string;
  timestamp: number;
}

interface StatsState extends UserStats {
  lastActivity: LastActivity | null;
  /** Local day the day-complete moment last fired — its replay guard (M6). Synced. */
  dayCompleteCelebratedOn: string | null;
  markDayCelebrated: (dayIso: string) => void;
  /** Set when the user returns after a long gap (M7) — drives welcome-back + triaged re-entry. Synced. */
  reentry: Reentry | null;
  acknowledgeReentry: () => void;
  recordActivity: () => void;
  /** Settle streak state for today (freezes / breaks) without recording activity —
   *  run on load and day rollover so the UI never paints a stale streak. */
  reconcile: () => void;
  addAyahsMemorized: (count: number) => void;
  setLastActivity: (activity: LastActivity) => void;
}

// Day boundaries are LOCAL (src/lib/dates.ts) — the old toISOString() versions
// flipped the day at UTC midnight, disagreeing with the plan's local dates
// (evening activity could count toward "tomorrow" and silently break streaks).

/** The plan's study days protect the streak; without a plan every day counts. */
function planStudyDays(): number[] {
  const days = usePlanStore.getState().plan?.studyDays;
  return days && days.length > 0 ? days : ALL_DAYS;
}

function streakFields(state: UserStats): StreakFields {
  return {
    currentStreak: state.currentStreak,
    longestStreak: state.longestStreak,
    lastActiveDate: state.lastActiveDate,
    streakFreezes: state.streakFreezes,
    frozenDates: state.frozenDates,
  };
}

/** Exported for migration tests. v3 adds freeze fields and clamps future-dated
 *  day strings (pre-M1 UTC dates could sit a day AHEAD of the local calendar). */
export function migrateStats(persisted: any, version: number) {
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
  if (version <= 2) {
    persisted.streakFreezes = persisted.streakFreezes ?? 0;
    persisted.frozenDates = persisted.frozenDates ?? {};
    // Clamp in the user's favor: a "future" last-active day (old UTC rendering)
    // would otherwise block today's streak increment entirely.
    const today = todayIso();
    if (persisted.lastActiveDate && persisted.lastActiveDate > today) persisted.lastActiveDate = today;
    if (persisted.dailyActivityDate && persisted.dailyActivityDate > today) persisted.dailyActivityDate = today;
  }
  return persisted;
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
      activityLog: {},
      streakFreezes: 0,
      frozenDates: {},
      lastActivity: null,
      dayCompleteCelebratedOn: null,
      reentry: null,

      markDayCelebrated: (dayIso) => set({ dayCompleteCelebratedOn: dayIso }),

      acknowledgeReentry: () =>
        set((s) => (s.reentry ? { reentry: { ...s.reentry, acknowledged: true } } : s)),

      recordActivity: () =>
        set((state) => {
          const today = todayIso();
          const isNewDay = state.dailyActivityDate !== today;

          // Always increment daily activities (reset if new day)
          const dailyActivities = isNewDay ? 1 : state.dailyActivities + 1;

          // Update activity log for heatmap
          const activityLog = { ...state.activityLog };
          activityLog[today] = (activityLog[today] ?? 0) + 1;

          // Streak only moves on the first activity of the day
          if (state.lastActiveDate === today) {
            return { dailyActivities, dailyActivityDate: today, activityLog };
          }

          return {
            ...recordActiveDay(streakFields(state), today, planStudyDays()),
            dailyActivities,
            dailyActivityDate: today,
            activityLog,
          };
        }),

      reconcile: () =>
        set((state) => {
          const today = todayIso();
          // Lapse detection runs BEFORE the streak break below, so the streak the
          // returner had is captured and shown — never silently reset (M7)
          let reentry = state.reentry;
          const gap = detectLapse(state.lastActiveDate, today);
          if (gap !== null && (!reentry || reentryDay(reentry, today) === null)) {
            reentry = { startedOn: today, gapDays: gap, streakBefore: state.currentStreak, acknowledged: false };
          }
          const settled = reconcileStreak(streakFields(state), today, planStudyDays());
          // Only publish on an actual change — this runs on every load/rollover tick
          if (
            settled.currentStreak === state.currentStreak &&
            settled.streakFreezes === state.streakFreezes &&
            settled.frozenDates === state.frozenDates &&
            reentry === state.reentry
          ) {
            return state;
          }
          return { ...settled, reentry };
        }),

      addAyahsMemorized: (count) =>
        set((state) => ({
          totalAyahsMemorized: state.totalAyahsMemorized + count,
        })),

      setLastActivity: (activity) => set({ lastActivity: activity }),
    }),
    {
      name: 'quran-stats',
      version: 3,
      migrate: migrateStats,
    }
  )
);
