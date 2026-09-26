import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  mergeStore,
  planStoreMerge,
  wrapPayload,
  readPayload,
  STORE_SCHEMA_VERSIONS,
  WRITE_ENVELOPE,
  encodeCloudRow,
  normalizeIncoming,
} from './merge'
import { stateHash } from './local'

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
  streakFreezes: fc.integer({ min: 0, max: 2 }),
  frozenDates: fc.dictionary(
    fc.constantFrom('2026-01-02', '2026-02-16'),
    fc.constant(true as const),
    { maxKeys: 2 }
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

  it('reviews: idempotent; each card resolves to its most recently reviewed copy', () => {
    fc.assert(fc.property(reviewsArb, reviewsArb, (a, b) => {
      expect(mergeStore('quran-reviews', a, a, true)).toEqual(a)
      const merged = mergeStore('quran-reviews', a, b, true) as typeof a
      const byId = (s: typeof a) => new Map(s.lessonCards.map((c) => [c.lessonId, c]))
      const [ca, cb, cm] = [byId(a), byId(b), byId(merged)]
      for (const id of new Set([...ca.keys(), ...cb.keys()])) {
        const x = ca.get(id), y = cb.get(id)
        const lastReview = Math.max(x?.lastReview ?? -1, y?.lastReview ?? -1)
        expect(cm.get(id)!.lastReview).toBe(lastReview)
      }
      expect(cm.size).toBe(new Set([...ca.keys(), ...cb.keys()]).size)
    }))
  })

  it('reviews REGRESSION: a lapse on one device survives the merge with a higher-reps copy', () => {
    const cloudCard = { lessonId: '1-1', repetitions: 5, interval: 30, lastReview: 1000, failStreak: 0, lapses: 0 }
    const lapsed = { lessonId: '1-1', repetitions: 0, interval: 1, lastReview: 2000, failStreak: 1, lapses: 1 }
    for (const [l, c] of [[lapsed, cloudCard], [cloudCard, lapsed]]) {
      const merged = mergeStore('quran-reviews', { cards: [], lessonCards: [l] }, { cards: [], lessonCards: [c] }, true) as { lessonCards: typeof lapsed[] }
      expect(merged.lessonCards[0]).toEqual(lapsed)
    }
  })

  it('reviews: a seeded "known" card (lastReview 0) never beats a real rating', () => {
    const seeded = { surahId: 78, ayahNumber: 1, repetitions: 1, lastReview: 0, lastQuality: 3 }
    const realFail = { surahId: 78, ayahNumber: 1, repetitions: 0, lastReview: 500, lastQuality: 1 }
    const merged = mergeStore('quran-reviews', { cards: [seeded], lessonCards: [] }, { cards: [realFail], lessonCards: [] }, true) as { cards: unknown[] }
    expect(merged.cards).toEqual([realFail])
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

  it('stats: freeze bank rides with the more recently active side; frozen days union', () => {
    fc.assert(fc.property(statsArb, statsArb, (a, b) => {
      const merged = mergeStore('quran-stats', a, b, true) as typeof a & { frozenDates: Record<string, true> }
      const recent = a.lastActiveDate >= b.lastActiveDate ? a : b
      // On a tie the smaller bank wins (the other side hasn't seen a spend yet)
      const expected = a.lastActiveDate === b.lastActiveDate
        ? Math.min(a.streakFreezes, b.streakFreezes)
        : recent.streakFreezes
      expect(merged.streakFreezes).toBe(expected)
      expect(merged.currentStreak).toBe(recent.currentStreak)
      // A day frozen on either device stays frozen — never double-charged
      for (const day of [...Object.keys(a.frozenDates), ...Object.keys(b.frozenDates)]) {
        expect(merged.frozenDates[day]).toBe(true)
      }
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

  it('plan: real revisions (revisedAt) from either device survive, max per surah; absent stays absent', () => {
    const plan = (revisedAt?: Record<string, number>) => ({
      plan: { id: 'p', completedLessonIds: [], lastRevisedAt: {}, ...(revisedAt ? { revisedAt } : {}) },
    })
    const merged = mergeStore('quran-plan', plan({ '1': 5, '112': 9 }), plan({ '1': 7 }), true) as { plan: { revisedAt?: Record<string, number> } }
    expect(merged.plan.revisedAt).toEqual({ '1': 7, '112': 9 })
    const neither = mergeStore('quran-plan', plan(), plan(), true) as { plan: Record<string, unknown> }
    expect('revisedAt' in neither.plan).toBe(false)
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

describe('pre-release hardening (review findings)', () => {
  it('stage 1 writes BARE state — the live pre-envelope app must keep reading rows', () => {
    const state = { lessons: {} }
    expect(WRITE_ENVELOPE).toBe(false)
    expect(encodeCloudRow(state, 2)).toBe(state)
    // …while envelopes written by a later stage are still read correctly
    expect(readPayload(wrapPayload(state, 2))).toEqual({ state, schemaVersion: 2 })
  })

  it('incoming reviews are normalized to local-midnight due dates (idempotent)', () => {
    const noon = new Date(2026, 8, 26, 12, 0).getTime()
    const once = normalizeIncoming('quran-reviews', { cards: [{ nextReview: noon }], lessonCards: [{ nextReview: noon }] })
    expect((once.cards as Array<{ nextReview: number }>)[0].nextReview).toBe(new Date(2026, 8, 26).getTime())
    expect(normalizeIncoming('quran-reviews', once)).toEqual(once)
  })

  it('incoming stats from an older client gain the freeze fields', () => {
    const s = normalizeIncoming('quran-stats', { currentStreak: 3 })
    expect(s).toMatchObject({ currentStreak: 3, streakFreezes: 0, frozenDates: {} })
  })

  it('planStoreMerge normalizes the cloud side before merging or adopting it', () => {
    const noon = new Date(2026, 8, 26, 12, 0).getTime()
    const plan = planStoreMerge({
      storeName: 'quran-reviews',
      local: null,
      cloud: { state: { cards: [], lessonCards: [{ lessonId: '1-1', nextReview: noon }] }, schemaVersion: 0 },
      cloudIsNewer: true,
    })
    expect((plan.newLocal!.lessonCards as Array<{ nextReview: number }>)[0].nextReview).toBe(new Date(2026, 8, 26).getTime())
  })

  it('the dirty-check hash ignores key order (Postgres JSONB reorders keys)', () => {
    expect(stateHash({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: 'z' } }))
      .toBe(stateHash({ a: { c: 'z', d: [1, { x: 1, y: 2 }] }, b: 1 }))
    expect(stateHash({ a: [1, 2] })).not.toBe(stateHash({ a: [2, 1] })) // array order still matters
  })
})
