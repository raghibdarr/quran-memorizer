'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LessonProgress, LessonPhase, TestLevel } from '@/types/quran';

interface ProgressState {
  lessons: Record<string, LessonProgress>;  // keyed by lessonId (e.g. "78-3")
  startLesson: (lessonId: string, surahId: number) => void;
  updatePhase: (lessonId: string, phase: LessonPhase) => void;
  incrementListenCount: (lessonId: string) => void;
  markUnderstandComplete: (lessonId: string) => void;
  updateExploredAyahs: (lessonId: string, explored: number[]) => void;
  updateChunkIndex: (lessonId: string, index: number) => void;
  updateChunkState: (lessonId: string, state: { index: number; stage: string; learnStep: string; repCount: number }) => void;
  markChunkComplete: (lessonId: string) => void;
  updateTestLevel: (lessonId: string, level: TestLevel) => void;
  markTestComplete: (lessonId: string) => void;
  completeLesson: (lessonId: string) => void;
  getLesson: (lessonId: string) => LessonProgress | undefined;
  resetLesson: (lessonId: string, surahId: number) => void;
  restartPractice: (lessonId: string) => void;
  getCompletedLessonsBySurah: (surahId: number) => string[];
  getActiveLessonForSurah: (surahId: number) => LessonProgress | undefined;
}

function createInitialProgress(lessonId: string, surahId: number): LessonProgress {
  return {
    lessonId,
    surahId,
    currentPhase: 'listen',
    phaseData: {
      listen: { playCount: 0, completed: false },
      understand: { wordsReviewed: 0, quizPassed: false, completed: false },
      chunk: { currentChunkIndex: 0, completed: false },
      test: { currentLevel: 'fill-blank', attempts: 0, completed: false },
    },
    startedAt: Date.now(),
    completedAt: null,
  };
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      lessons: {},

      startLesson: (lessonId, surahId) =>
        set((state) => {
          if (state.lessons[lessonId]) return state;
          return {
            lessons: { ...state.lessons, [lessonId]: createInitialProgress(lessonId, surahId) },
          };
        }),

      updatePhase: (lessonId, phase) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: { ...state.lessons, [lessonId]: { ...lesson, currentPhase: phase } },
          };
        }),

      incrementListenCount: (lessonId) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          const newCount = lesson.phaseData.listen.playCount + 1;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  listen: { playCount: newCount, completed: newCount >= 3 },
                },
              },
            },
          };
        }),

      markUnderstandComplete: (lessonId) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  understand: { ...lesson.phaseData.understand, quizPassed: true, completed: true },
                },
              },
            },
          };
        }),

      updateExploredAyahs: (lessonId, explored) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  understand: { ...lesson.phaseData.understand, exploredAyahs: explored },
                },
              },
            },
          };
        }),

      updateChunkIndex: (lessonId, index) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  chunk: { ...lesson.phaseData.chunk, currentChunkIndex: index },
                },
              },
            },
          };
        }),

      updateChunkState: (lessonId, { index, stage, learnStep, repCount }) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  chunk: {
                    ...lesson.phaseData.chunk,
                    currentChunkIndex: index,
                    stage: stage as LessonProgress['phaseData']['chunk']['stage'],
                    learnStep: learnStep as LessonProgress['phaseData']['chunk']['learnStep'],
                    repCount,
                  },
                },
              },
            },
          };
        }),

      markChunkComplete: (lessonId) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  chunk: { ...lesson.phaseData.chunk, completed: true },
                },
              },
            },
          };
        }),

      updateTestLevel: (lessonId, level) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  test: { ...lesson.phaseData.test, currentLevel: level },
                },
              },
            },
          };
        }),

      markTestComplete: (lessonId) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  test: { ...lesson.phaseData.test, completed: true },
                },
              },
            },
          };
        }),

      completeLesson: (lessonId) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: { ...lesson, currentPhase: 'complete', completedAt: Date.now() },
            },
          };
        }),

      getLesson: (lessonId) => get().lessons[lessonId],

      resetLesson: (lessonId, surahId) =>
        set((state) => ({
          lessons: { ...state.lessons, [lessonId]: createInitialProgress(lessonId, surahId) },
        })),

      restartPractice: (lessonId) =>
        set((state) => {
          const lesson = state.lessons[lessonId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [lessonId]: {
                ...lesson,
                currentPhase: 'chunk',
                completedAt: null,
                phaseData: {
                  ...lesson.phaseData,
                  chunk: { currentChunkIndex: 0, completed: false },
                  test: { currentLevel: 'fill-blank', attempts: 0, completed: false },
                },
              },
            },
          };
        }),

      getCompletedLessonsBySurah: (surahId) =>
        Object.values(get().lessons)
          .filter((l) => l.surahId === surahId && l.completedAt !== null)
          .map((l) => l.lessonId),

      getActiveLessonForSurah: (surahId) =>
        Object.values(get().lessons)
          .find((l) => l.surahId === surahId && l.completedAt === null),
    }),
    {
      name: 'quran-progress',
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) {
          // Old format used numeric surahId keys — clear and start fresh
          return { lessons: {} };
        }
        return persisted as ProgressState;
      },
    }
  )
);
