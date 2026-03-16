'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LessonProgress, LessonPhase, TestLevel } from '@/types/quran';

interface ProgressState {
  lessons: Record<number, LessonProgress>;
  startLesson: (surahId: number) => void;
  updatePhase: (surahId: number, phase: LessonPhase) => void;
  incrementListenCount: (surahId: number) => void;
  markUnderstandComplete: (surahId: number) => void;
  updateChunkIndex: (surahId: number, index: number) => void;
  markChunkComplete: (surahId: number) => void;
  updateTestLevel: (surahId: number, level: TestLevel) => void;
  markTestComplete: (surahId: number) => void;
  completeLesson: (surahId: number) => void;
  getLesson: (surahId: number) => LessonProgress | undefined;
  getCompletedSurahIds: () => number[];
}

function createInitialProgress(surahId: number): LessonProgress {
  return {
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

      startLesson: (surahId) =>
        set((state) => {
          if (state.lessons[surahId]) return state;
          return {
            lessons: {
              ...state.lessons,
              [surahId]: createInitialProgress(surahId),
            },
          };
        }),

      updatePhase: (surahId, phase) =>
        set((state) => {
          const lesson = state.lessons[surahId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [surahId]: { ...lesson, currentPhase: phase },
            },
          };
        }),

      incrementListenCount: (surahId) =>
        set((state) => {
          const lesson = state.lessons[surahId];
          if (!lesson) return state;
          const newCount = lesson.phaseData.listen.playCount + 1;
          return {
            lessons: {
              ...state.lessons,
              [surahId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  listen: {
                    playCount: newCount,
                    completed: newCount >= 3,
                  },
                },
              },
            },
          };
        }),

      markUnderstandComplete: (surahId) =>
        set((state) => {
          const lesson = state.lessons[surahId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [surahId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  understand: { ...lesson.phaseData.understand, quizPassed: true, completed: true },
                },
              },
            },
          };
        }),

      updateChunkIndex: (surahId, index) =>
        set((state) => {
          const lesson = state.lessons[surahId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [surahId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  chunk: { ...lesson.phaseData.chunk, currentChunkIndex: index },
                },
              },
            },
          };
        }),

      markChunkComplete: (surahId) =>
        set((state) => {
          const lesson = state.lessons[surahId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [surahId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  chunk: { ...lesson.phaseData.chunk, completed: true },
                },
              },
            },
          };
        }),

      updateTestLevel: (surahId, level) =>
        set((state) => {
          const lesson = state.lessons[surahId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [surahId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  test: { ...lesson.phaseData.test, currentLevel: level },
                },
              },
            },
          };
        }),

      markTestComplete: (surahId) =>
        set((state) => {
          const lesson = state.lessons[surahId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [surahId]: {
                ...lesson,
                phaseData: {
                  ...lesson.phaseData,
                  test: { ...lesson.phaseData.test, completed: true },
                },
              },
            },
          };
        }),

      completeLesson: (surahId) =>
        set((state) => {
          const lesson = state.lessons[surahId];
          if (!lesson) return state;
          return {
            lessons: {
              ...state.lessons,
              [surahId]: {
                ...lesson,
                currentPhase: 'complete',
                completedAt: Date.now(),
              },
            },
          };
        }),

      getLesson: (surahId) => get().lessons[surahId],

      getCompletedSurahIds: () =>
        Object.values(get().lessons)
          .filter((l) => l.completedAt !== null)
          .map((l) => l.surahId),
    }),
    { name: 'quran-progress' }
  )
);
