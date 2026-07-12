import { describe, expect, it } from 'vitest'
import { mergeStore, STORE_SCHEMA_VERSIONS, type SyncRowName } from './merge'
import { migrateProgress } from '@/stores/progress-store'

// Golden persisted-state fixtures: realistic current-shape snapshots per store.
// Two jobs: (1) pin that every merge is idempotent on REAL shapes (not just the
// property-test arbitraries), (2) fail loudly if a store's shape drifts without
// this file (and STORE_SCHEMA_VERSIONS) being updated deliberately.

const FIXTURES: Record<SyncRowName, Record<string, unknown>> = {
  'quran-progress': {
    lessons: {
      '112-1': {
        lessonId: '112-1', surahId: 112, currentPhase: 'complete',
        phaseData: {
          listen: { playCount: 3, completed: true },
          understand: { wordsReviewed: 4, quizPassed: true, completed: true, exploredAyahs: [0, 1, 2, 3] },
          chunk: { currentChunkIndex: 3, completed: true, stage: 'final-chain' },
          test: { currentLevel: 'full-recall', attempts: 1, completed: true },
        },
        startedAt: 1780000000000, completedAt: 1780000360000,
      },
      '2-161': {
        lessonId: '2-161', surahId: 2, currentPhase: 'chunk',
        phaseData: {
          listen: { playCount: 3, completed: true },
          understand: { wordsReviewed: 10, quizPassed: false, completed: true, exploredAyahs: [0] },
          chunk: { currentChunkIndex: 4, completed: false, stage: 'learning', learnStep: 'recite-from-memory', repCount: 2 },
          test: { currentLevel: 'fill-blank', attempts: 0, completed: false },
        },
        startedAt: 1780100000000, completedAt: null,
      },
    },
  },
  'quran-reviews': {
    cards: [
      { surahId: 112, ayahNumber: 1, easeFactor: 2.6, interval: 7, repetitions: 3, nextReview: 1780700000000, lastReview: 1780100000000, lastQuality: 5 },
    ],
    lessonCards: [
      { lessonId: '112-1', surahId: 112, lessonNumber: 1, ayahStart: 1, ayahEnd: 4, easeFactor: 2.5, interval: 3, repetitions: 2, nextReview: 1780400000000, lastReview: 1780100000000, lastQuality: 4 },
    ],
  },
  'quran-stats': {
    currentStreak: 12, longestStreak: 30, totalAyahsMemorized: 45,
    lastActiveDate: '2026-07-11', dailyActivities: 2, dailyActivityDate: '2026-07-11',
    activityLog: { '2026-07-10': 3, '2026-07-11': 2 },
    streakFreezes: 1, frozenDates: { '2026-07-05': true },
    lastActivity: { type: 'lesson', url: '/lesson/112/1', label: 'Al-Ikhlas — Lesson 1', timestamp: 1780100000000 },
  },
  'quran-settings': {
    reciter: 'Alafasy_128kbps', arabicScript: 'tajweed', arabicFontSize: 1,
    transliterationEnabled: true, translationEnabled: true, playbackSpeed: 1, dailyGoalActivities: 2,
  },
  'quran-practice': {
    sessions: [
      { id: 'abc123', timestamp: 1780100000000, surahIds: [112], lessonIds: ['112-1'], ayahRange: { start: 1, end: 4 }, ayahResults: [{ surahId: 112, ayahNumber: 1, rating: 'got-it' }], overallRating: 'smooth' },
    ],
  },
  'quran-plan': {
    plan: {
      id: 'plan-1', createdAt: 1779000000000, goalType: 'juz', goalSurahIds: [78, 79, 80],
      goalJuzNumbers: [30], deadline: null, knownSurahIds: [112, 113, 114], knownLessonIds: [],
      lessonsPerDay: 1, studyDays: [0, 1, 2, 3, 4, 5, 6], completedLessonIds: ['112-1'],
      revisionFrequencyDays: 7, lastRevisedAt: { '112': 1780100000000 },
    },
  },
  'quran-essentials': {
    memorized: { 'dua-morning-1': true }, favorites: { 'dhikr-1': true }, counters: { 'dhikr-1': 33 },
  },
  'quran-flags': {
    'onboarding-complete': 'true', 'chunk-explainer-seen': 'true', 'home-tab': 'surahs',
  },
}

describe('golden fixtures', () => {
  for (const [name, fixture] of Object.entries(FIXTURES) as Array<[SyncRowName, Record<string, unknown>]>) {
    it(`${name}: merge is idempotent on the real persisted shape`, () => {
      expect(mergeStore(name, fixture, fixture, true)).toEqual(fixture)
      expect(mergeStore(name, fixture, fixture, false)).toEqual(fixture)
    })
  }

  it('schema-version map matches the stores (bump BOTH together, deliberately)', () => {
    // Mirrors each store's zustand persist `version`. If this fails you changed a
    // store's version — update STORE_SCHEMA_VERSIONS and add migration handling.
    expect(STORE_SCHEMA_VERSIONS).toEqual({
      'quran-progress': 2,
      'quran-reviews': 2,
      'quran-stats': 3,
      'quran-settings': 2,
      'quran-practice': 1,
      'quran-plan': 1,
      'quran-essentials': 1,
      'quran-flags': 1,
    })
  })
})

describe('documented migration decisions', () => {
  it('progress pre-v2 state is deliberately DISCARDED (numeric surahId keys cannot map to lessonIds)', () => {
    const v1 = { lessons: { '78': { surahId: 78, currentPhase: 'chunk' } } }
    expect(migrateProgress(v1, 1)).toEqual({ lessons: {} })
  })

  it('progress v2 passes through untouched', () => {
    const v2 = FIXTURES['quran-progress']
    expect(migrateProgress(v2, 2)).toBe(v2)
  })
})
