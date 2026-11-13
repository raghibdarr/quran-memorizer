import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { mergeStore, planStoreMerge } from './merge'

// quran-deen merge (all-in-one spec 3.2): per card the later lastReview wins,
// lessonsDone keeps the earliest finish, settings come from the newer side.
// Pinned like the other stores: idempotent, commutative, no loss.

const ids = ['nawawi40:01:recall', 'nawawi40:01:meaning', 'names99:001:ar-en', 'course-fasting:f-01:c1']

const cardArb = fc.record({
  deck: fc.constantFrom('nawawi40', 'names99'),
  itemRev: fc.integer({ min: 1, max: 3 }),
  addedAt: fc.integer({ min: 0, max: 1000 }),
  easeFactor: fc.constantFrom(1.3, 2.3, 2.5),
  interval: fc.integer({ min: 0, max: 60 }),
  repetitions: fc.integer({ min: 0, max: 8 }),
  nextReview: fc.integer({ min: 0, max: 10_000 }),
  lastReview: fc.integer({ min: 0, max: 10_000 }),
  lastQuality: fc.integer({ min: 0, max: 5 }),
  // sorted, unique, at most 10: the shape the store writes
  misses: fc.option(fc.uniqueArray(fc.integer({ min: 1, max: 9_999 }), { maxLength: 4 }).map((m) => m.sort((a, b) => a - b)), { nil: undefined }),
}).map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)))

const deenArb = fc.record({
  cards: fc.dictionary(fc.constantFrom(...ids), cardArb, { maxKeys: 4 }),
  lessonsDone: fc.dictionary(fc.constantFrom('f-01', 'f-02', 'w-01'), fc.integer({ min: 1, max: 10_000 }), { maxKeys: 3 }),
  depth: fc.dictionary(fc.constantFrom('nawawi40', 'names99'), fc.constantFrom('meaning', 'arabic'), { maxKeys: 2 }),
  school: fc.constantFrom(null, 'hanafi', 'maliki', 'shafii', 'hanbali'),
  newPerDay: fc.integer({ min: 0, max: 20 }),
  introduced: fc.dictionary(fc.constantFrom('2026-07-10', '2026-07-11'), fc.integer({ min: 1, max: 9 }), { maxKeys: 2 }),
})

const merge = (a: Record<string, unknown>, b: Record<string, unknown>, cloudIsNewer: boolean) =>
  mergeStore('quran-deen', a, b, cloudIsNewer)

describe('quran-deen merge properties', () => {
  it('idempotent: merging a state with itself changes nothing', () => {
    fc.assert(fc.property(deenArb, fc.boolean(), (s, newer) => {
      expect(merge(s, s, newer)).toEqual(s)
    }))
  })

  it('commutative: the same result whichever side is local', () => {
    fc.assert(fc.property(deenArb, deenArb, fc.boolean(), (a, b, cloudIsNewer) => {
      expect(merge(a, b, cloudIsNewer)).toEqual(merge(b, a, !cloudIsNewer))
    }))
  })

  it('merging twice is the same as once (repeat syncs settle)', () => {
    fc.assert(fc.property(deenArb, deenArb, fc.boolean(), (a, b, newer) => {
      const once = merge(a, b, newer)
      expect(merge(once, b, newer)).toEqual(once)
    }))
  })

  it('no loss: every card, finished lesson and deck depth survives; the later review wins', () => {
    fc.assert(fc.property(deenArb, deenArb, fc.boolean(), (a, b, newer) => {
      const m = merge(a, b, newer) as typeof a
      for (const id of [...Object.keys(a.cards), ...Object.keys(b.cards)]) {
        expect(m.cards[id]).toBeDefined()
        const latest = Math.max((a.cards[id]?.lastReview as number) ?? -1, (b.cards[id]?.lastReview as number) ?? -1)
        expect(m.cards[id].lastReview).toBe(latest)
      }
      for (const id of [...Object.keys(a.lessonsDone), ...Object.keys(b.lessonsDone)]) {
        expect(m.lessonsDone[id]).toBe(Math.min(a.lessonsDone[id] ?? Infinity, b.lessonsDone[id] ?? Infinity))
      }
      for (const deck of [...Object.keys(a.depth), ...Object.keys(b.depth)]) expect(m.depth[deck]).toBeDefined()
    }))
  })

  it('settings come from the newer side', () => {
    const local = { cards: {}, lessonsDone: {}, depth: { nawawi40: 'meaning' }, school: 'hanafi', newPerDay: 3, introduced: {} }
    const cloud = { cards: {}, lessonsDone: {}, depth: { nawawi40: 'arabic' }, school: 'maliki', newPerDay: 8, introduced: {} }
    expect(merge(local, cloud, true)).toMatchObject({ school: 'maliki', newPerDay: 8, depth: { nawawi40: 'arabic' } })
    expect(merge(local, cloud, false)).toMatchObject({ school: 'hanafi', newPerDay: 3, depth: { nawawi40: 'meaning' } })
  })

  it('a lapse on one device is kept (recency, not repetitions)', () => {
    const strong = { deck: 'nawawi40', itemRev: 1, addedAt: 0, easeFactor: 2.5, interval: 30, repetitions: 6, nextReview: 9000, lastReview: 100, lastQuality: 5 }
    const lapsed = { ...strong, interval: 1, repetitions: 0, lastReview: 200, lastQuality: 1, misses: [200] }
    const m = merge({ cards: { x: strong } }, { cards: { x: lapsed } }, false) as { cards: Record<string, { repetitions: number }> }
    expect(m.cards.x.repetitions).toBe(0)
  })

  it('a cloud row from a newer app version is left alone', () => {
    const plan = planStoreMerge({ storeName: 'quran-deen', local: { cards: {} }, cloud: { state: { cards: {} }, schemaVersion: 99 }, cloudIsNewer: true })
    expect(plan.blockedByNewerSchema).toBe(true)
  })
})
