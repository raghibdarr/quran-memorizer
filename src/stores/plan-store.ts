'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HifdhPlan, PlanGoalType, JuzMeta } from '@/types/quran';
import { resolveGoalSurahIds, staggeredLastRevised } from '@/lib/plan';

export interface CreatePlanConfig {
  goalType: PlanGoalType;
  surahIds?: number[];
  juzNumbers?: number[];
  deadline: string | null;
  knownSurahIds: number[];
  knownLessonIds?: string[];
  lessonsPerDay: number;
  studyDays: number[];
  revisionFrequencyDays?: number;
  juzIndex: JuzMeta[];
}

interface PlanState {
  plan: HifdhPlan | null;

  createPlan: (config: CreatePlanConfig) => void;
  deletePlan: () => void;
  /** Legacy-plan opt-in/out for M4 known-surah tracking (the dashboard banner). */
  setKnownTracking: (enabled: boolean) => void;

  updatePace: (lessonsPerDay: number) => void;
  updateDeadline: (deadline: string | null) => void;
  updateStudyDays: (days: number[]) => void;
  updateRevisionFrequency: (days: number) => void;
  setRevisionFrequencyAuto: (auto: boolean) => void;
  toggleKnownSurah: (surahId: number) => void;
  toggleKnownLesson: (lessonId: string) => void;

  markLessonCompleted: (lessonId: string) => void;
  markSurahRevised: (surahId: number) => void;

  applyCatchUp: (bonusLessons: number, dateIso: string) => void;
  markFinishCelebrated: () => void;

  updateGoalScope: (scope: {
    goalType: PlanGoalType;
    goalSurahIds: number[];
    goalJuzNumbers: number[];
    knownSurahIds: number[];
    knownLessonIds: string[];
  }) => void;
}

function makePlanId() {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => ({
      plan: null,

      createPlan: (config) => {
        const goalSurahIds = resolveGoalSurahIds(
          config.goalType,
          { surahIds: config.surahIds, juzNumbers: config.juzNumbers },
          config.juzIndex,
        );
        // A maintain plan is "everything in scope is already known" — pure revision
        const knownSurahIds = config.goalType === 'maintain' ? goalSurahIds : config.knownSurahIds;
        const frequency = config.revisionFrequencyDays ?? 7;
        const plan: HifdhPlan = {
          id: makePlanId(),
          createdAt: Date.now(),
          goalType: config.goalType,
          goalSurahIds,
          goalJuzNumbers: config.juzNumbers ?? [],
          deadline: config.deadline,
          knownSurahIds,
          knownTracking: true,
          knownLessonIds: config.knownLessonIds ?? [],
          lessonsPerDay: Math.max(1, Math.min(20, config.lessonsPerDay)),
          studyDays: config.studyDays.length > 0 ? config.studyDays : [0, 1, 2, 3, 4, 5, 6],
          completedLessonIds: [],
          revisionFrequencyDays: frequency,
          lastRevisedAt: staggeredLastRevised(knownSurahIds, frequency),
          catchUpDate: null,
          catchUpBonus: 0,
          finishCelebrated: false,
        };
        set({ plan });
      },

      setKnownTracking: (enabled) =>
        set((s) => {
          if (!s.plan) return s;
          return {
            plan: {
              ...s.plan,
              knownTracking: enabled,
              lastRevisedAt: enabled
                ? staggeredLastRevised(s.plan.knownSurahIds, s.plan.revisionFrequencyDays, s.plan.lastRevisedAt)
                : s.plan.lastRevisedAt,
            },
          };
        }),

      deletePlan: () => set({ plan: null }),

      updatePace: (lessonsPerDay) =>
        set((s) => {
          if (!s.plan) return s;
          return { plan: { ...s.plan, lessonsPerDay: Math.max(1, Math.min(20, lessonsPerDay)) } };
        }),

      updateDeadline: (deadline) =>
        set((s) => (s.plan ? { plan: { ...s.plan, deadline } } : s)),

      updateStudyDays: (days) =>
        set((s) => {
          if (!s.plan) return s;
          const studyDays = days.length > 0 ? [...new Set(days)].sort() : [0, 1, 2, 3, 4, 5, 6];
          return { plan: { ...s.plan, studyDays } };
        }),

      updateRevisionFrequency: (days) =>
        set((s) => {
          if (!s.plan) return s;
          // Manual adjustment turns auto mode off
          return {
            plan: { ...s.plan, revisionFrequencyDays: Math.max(1, days), revisionFrequencyAuto: false },
          };
        }),

      setRevisionFrequencyAuto: (auto) =>
        set((s) => (s.plan ? { plan: { ...s.plan, revisionFrequencyAuto: auto } } : s)),

      toggleKnownSurah: (surahId) =>
        set((s) => {
          if (!s.plan) return s;
          const known = new Set(s.plan.knownSurahIds);
          const turningOn = !known.has(surahId);
          if (turningOn) known.add(surahId);
          else known.delete(surahId);
          // Marking known = "revised as of now" so the revision timer starts today.
          // Un-marking keeps lastRevisedAt (harmless) and any seeded card ratings.
          const lastRevisedAt = turningOn && s.plan.lastRevisedAt[surahId] == null
            ? { ...s.plan.lastRevisedAt, [surahId]: Date.now() }
            : s.plan.lastRevisedAt;
          return { plan: { ...s.plan, knownSurahIds: Array.from(known), lastRevisedAt } };
        }),

      markLessonCompleted: (lessonId) => {
        const s = get();
        if (!s.plan) return;
        if (!s.plan.goalSurahIds.some((id) => lessonId.startsWith(`${id}-`))) return;
        if (s.plan.completedLessonIds.includes(lessonId)) return;
        set({
          plan: {
            ...s.plan,
            completedLessonIds: [...s.plan.completedLessonIds, lessonId],
          },
        });
      },

      markSurahRevised: (surahId) =>
        set((s) => {
          if (!s.plan) return s;
          return {
            plan: {
              ...s.plan,
              lastRevisedAt: { ...s.plan.lastRevisedAt, [surahId]: Date.now() },
            },
          };
        }),

      toggleKnownLesson: (lessonId) =>
        set((s) => {
          if (!s.plan) return s;
          const known = new Set(s.plan.knownLessonIds ?? []);
          if (known.has(lessonId)) known.delete(lessonId);
          else known.add(lessonId);
          return { plan: { ...s.plan, knownLessonIds: Array.from(known) } };
        }),

      applyCatchUp: (bonusLessons, dateIso) =>
        set((s) => {
          if (!s.plan) return s;
          const clamped = Math.max(0, Math.min(10, Math.floor(bonusLessons)));
          return { plan: { ...s.plan, catchUpDate: dateIso, catchUpBonus: clamped } };
        }),

      markFinishCelebrated: () =>
        set((s) => (s.plan ? { plan: { ...s.plan, finishCelebrated: true } } : s)),

      updateGoalScope: (scope) =>
        set((s) => {
          if (!s.plan) return s;
          // Newly-known surahs join the rotation staggered (like setup), instead of
          // all falling back to plan.createdAt and jumping the queue as "oldest"
          const wasKnown = new Set(s.plan.knownSurahIds);
          const added = scope.knownSurahIds.filter((id) => !wasKnown.has(id));
          return {
            plan: {
              ...s.plan,
              goalType: scope.goalType,
              goalSurahIds: scope.goalSurahIds,
              goalJuzNumbers: scope.goalJuzNumbers,
              knownSurahIds: scope.knownSurahIds,
              knownLessonIds: scope.knownLessonIds,
              lastRevisedAt: added.length
                ? staggeredLastRevised(added, s.plan.revisionFrequencyDays, s.plan.lastRevisedAt)
                : s.plan.lastRevisedAt,
            },
          };
        }),
    }),
    // version + passthrough migrate: zustand DISCARDS persisted state on a version
    // mismatch without a migrate fn — every store must carry both (M2)
    { name: 'quran-plan', version: 1, migrate: (p) => p as never },
  ),
);
