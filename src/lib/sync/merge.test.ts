import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  mergeStore,
  planStoreMerge,
  wrapPayload,
  readPayload,
  STORE_SCHEMA_VERSIONS,
} from './merge'

// --- Arbitraries (deciding fields only, so ties are value-identical) ---

const phaseArb = fc.constantFrom('listen', 'understand', 'chunk', 'test', 'complete')

const lessonArb = fc.record({
  currentPhase: phaseArb,
  completedAt: fc.option(fc.integer({ min: 1, max: 10_000 }), { nil: null }),
  surahId: fc.integer({ min: 1, max: 114 }),
})

const progressArb = fc.dictionary(
  fc.integer({ min: 1, max: 30 }).map((n) => `1-${n}`),
  lessonArb,
  { maxKeys: 8 }
).map((lessons) => ({ lessons }))

const lessonCardArb = (lessonId: string) => fc.record({
  lessonId: fc.constant(lessonId),
  repetitions: fc.integer({ min: 0, max: 20 }),
  lastReview: fc.integer({ min: 0, max: 10_000 }),
  interval: fc.integer({ min: 0, max: 365 }),
})

const reviewsArb = fc.uniqueArray(fc.integer({ min: 1, max: 40 }), { maxLength: 8 })
  .chain((ids) => fc.tuple(...ids.map((id) => lessonCardArb(`1-${id}`))))
  .map((lessonCards) => ({ cards: [], lessonCards: [...lessonCards] }))

const statsArb = fc.record({
  currentStreak: fc.integer({ min: 0, max: 400 }),
  longestStreak: fc.integer({ min: 0, max: 400 }),
  totalAyahsMemorized: fc.integer({ min: 0, max: 6236 }),
  lastActiveDate: fc.constantFrom('2026-01-01', '2026-02-15', '2026-07-01'),
  dailyActivities: fc.integer({ min: 0, max: 20 }),
  dailyActivityDate: fc.constantFrom('2026-01-01', '2026-02-15', '2026-07-01'),
  activityLog: fc.dictionary(
    fc.constantFrom('2026-01-01', '2026-02-15', '2026-07-01'),
    fc.integer({ min: 1, max: 20 }),
    { maxKeys: 3 }
  ),
  lastActivity: fc.constant(null),
})

const planArb = fc.record({
  plan: fc.option(
    fc.record({
      id: fc.constantFrom('p1', 'p2'),
      completedLessonIds: fc.uniqueArray(fc.constantFrom('1-1', '1-2', '112-1', '2-161'), { maxLength: 4 }),
      lastRevisedAt: fc.dictionary(fc.constantFrom('1', '2', '112'), fc.integer({ min: 1, max: 10_000 }), { maxKeys: 3 }),
    }),
    { nil: null }
  ),
})

const essentialsArb = fc.record({
  memorized: fc.dictionary(fc.constantFrom('dua-1', 'dua-2', 'dhikr-1'), fc.boolean(), { maxKeys: 3 }),
  favorites: fc.dictionary(fc.constantFrom('dua-1', 'dua-2', 'dhikr-1'), fc.boolean(), { maxKeys: 3 }),
  counters: fc.dictionary(fc.constantFrom('dua-1', 'dhikr-1'), fc.integer({ min: 0, max: 100 }), { maxKeys: 2 }),
})

const practiceArb = fc.uniqueArray(fc.integer({ min: 1, max: 100 }), { maxLength: 6 })
  .map((ids) => ({
    sessions: ids
      .map((id) => ({ id: `s${id}`, timestamp: id * 100 }))
      .sort((a, b) => b.timestamp - a.timestamp),
  }))

// --- Properties ---

describe('merge properties (fast-check)', () => {
  it('progress: idempotent, and a completion in either side always survives', () => {
    fc.assert(fc.property(progressArb, progressArb, (a, b) => {
      expect(mergeStore('quran-progress', a, a, true)).toEqual(a)
      for (const order of [[a, b], [b, a]] as const) {
        const merged = mergeStore('quran-progress', order[0], order[1], true) as typeof a
        const keys = new Set([...Object.keys(a.lessons), ...Object.keys(b.lessons)])
        expect(new Set(Object.keys(merged.lessons))).toEqual(keys)
        for (const k of keys) {
          const completed = a.lessons[k]?.completedAt || b.lessons[k]?.completedAt
          if (completed) expect(merged.lessons[k].completedAt).toBeTruthy()
        }
      }
    }))
  })

  it('reviews: idempotent; merged repetitions per card equal the max of both sides', () => {
    fc.assert(fc.property(reviewsArb, reviewsArb, (a, b) => {
      expect(mergeStore('quran-reviews', a, a, true)).toEqual(a)
      const merged = mergeStore('quran-reviews', a, b, true) as typeof a
      const repsOf = (s: typeof a) => new Map(s.lessonCards.map((c) => [c.lessonId, c.repetitions]))
      const [ra, rb, rm] = [repsOf(a), repsOf(b), repsOf(merged)]
      for (const id of new Set([...ra.keys(), ...rb.keys()])) {
        expect(rm.get(id)).toBe(Math.max(ra.get(id) ?? -1, rb.get(id) ?? -1))
      }
      expect(rm.size).toBe(new Set([...ra.keys(), ...rb.keys()]).size)
    }))
  })

  it('stats: activity log takes the max per date; longest streak never shrinks', () => {
    fc.assert(fc.property(statsArb, statsArb, (a, b) => {
      const merged = mergeStore('quran-stats', a, b, true) as typeof a
      for (const date of new Set([...Object.keys(a.activityLog), ...Object.keys(b.activityLog)])) {
        expect(merged.activityLog[date]).toBe(Math.max(a.activityLog[date] ?? 0, b.activityLog[date] ?? 0))
      }
      expect(merged.longestStreak).toBe(Math.max(a.longestStreak, b.longestStreak))
      expect(merged.totalAyahsMemorized).toBe(Math.max(a.totalAyahsMemorized, b.totalAyahsMemorized))
    }))
  })

  it('plan (same id): completed lessons are a union; revision timestamps take the max', () => {
    fc.assert(fc.property(planArb, planArb, (a, b) => {
      if (!a.plan || !b.plan || a.plan.id !== b.plan.id) return
      const merged = mergeStore('quran-plan', a, b, true) as typeof a
      const ids = new Set(merged.plan!.completedLessonIds)
      for (const id of [...a.plan.completedLessonIds, ...b.plan.completedLessonIds]) {
        expect(ids.has(id)).toBe(true)
      }
      for (const k of new Set([...Object.keys(a.plan.lastRevisedAt), ...Object.keys(b.plan.lastRevisedAt)])) {
        expect(merged.plan!.lastRevisedAt[k]).toBe(Math.max(a.plan.lastRevisedAt[k] ?? 0, b.plan.lastRevisedAt[k] ?? 0))
      }
    }))
  })

  it('essentials: memorized is a true-wins union; counters take the max', () => {
    fc.assert(fc.property(essentialsArb, essentialsArb, (a, b) => {
      const merged = mergeStore('quran-essentials', a, b, true) as typeof a
      for (const k of new Set([...Object.keys(a.memorized), ...Object.keys(b.memorized)])) {
        if (a.memorized[k] || b.memorized[k]) expect(merged.memorized[k]).toBe(true)
      }
      for (const k of new Set([...Object.keys(a.counters), ...Object.keys(b.counters)])) {
        expect(merged.counters[k]).toBe(Math.max(a.counters[k] ?? 0, b.counters[k] ?? 0))
      }
    }))
  })

  it('practice: idempotent; sessions are a duplicate-free union', () => {
    fc.assert(fc.property(practiceArb, practiceArb, (a, b) => {
      expect(mergeStore('quran-practice', a, a, true)).toEqual(a)
      const merged = mergeStore('quran-practice', a, b, true) as typeof a
      const ids = merged.sessions.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(new Set(ids)).toEqual(new Set([...a.sessions, ...b.sessions].map((s) => s.id)))
    }))
  })

  it('flags: a set flag is never unset; local wins conflicts', () => {
    const local = { 'onboarding-complete': 'true', 'home-tab': 'juz' }
    const cloud = { 'onboarding-complete': 'true', 'home-tab': 'surahs', 'chunk-explainer-seen': 'true' }
    expect(mergeStore('quran-flags', local, cloud, true)).toEqual({
      'onboarding-complete': 'true',
      'home-tab': 'juz',
      'chunk-explainer-seen': 'true',
    })
  })
})

describe('cloud payload envelope', () => {
  it('roundtrips state + schemaVersion', () => {
    const state = { lessons: { '1-1': { currentPhase: 'test' } } }
    const payload = readPayload(wrapPayload(state, 2))
    expect(payload).toEqual({ state, schemaVersion: 2 })
  })

  it('reads legacy bare-state rows as version 0', () => {
    const bare = { lessons: {}, someKey: 1 }
    expect(readPayload(bare)).toEqual({ state: bare, schemaVersion: 0 })
  })
})

describe('planStoreMerge', () => {
  it('NEVER merges or uploads when the cloud schema is newer than this client', () => {
    const clientV = STORE_SCHEMA_VERSIONS['quran-progress']
    const plan = planStoreMerge({
      storeName: 'quran-progress',
      local: { lessons: { '1-1': { currentPhase: 'listen', completedAt: null } } },
      cloud: { state: { lessons: {} }, schemaVersion: clientV + 1 },
      cloudIsNewer: true,
    })
    expect(plan).toEqual({ newLocal: null, upload: null, blockedByNewerSchema: true })
  })

  it('fresh device: cloud state lands locally without an upload', () => {
    const cloudState = { lessons: { '1-1': { currentPhase: 'complete', completedAt: 5 } } }
    const plan = planStoreMerge({
      storeName: 'quran-progress',
      local: null,
      cloud: { state: cloudState, schemaVersion: 2 },
      cloudIsNewer: true,
    })
    expect(plan.newLocal).toEqual(cloudState)
    expect(plan.upload).toBeNull()
  })

  it('fresh account: local state uploads without touching local', () => {
    const local = { lessons: {} }
    const plan = planStoreMerge({ storeName: 'quran-progress', local, cloud: null, cloudIsNewer: false })
    expect(plan.upload).toBe(local)
    expect(plan.newLocal).toBeNull()
  })

  it('cloud unchanged since last sync: local uploads as-is, no merge applied', () => {
    const local = { lessons: { '1-1': { currentPhase: 'test', completedAt: null } } }
    const plan = planStoreMerge({
      storeName: 'quran-progress',
      local,
      cloud: { state: { lessons: {} }, schemaVersion: 2 },
      cloudIsNewer: false,
    })
    expect(plan.upload).toBe(local)
    expect(plan.newLocal).toBeNull()
  })
})
