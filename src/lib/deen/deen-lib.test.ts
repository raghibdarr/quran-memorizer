import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { arabicSkeleton, looseSkeleton, isUnvocalised } from './normalize-arabic'
import * as build from '../../../scripts/build-deen.mjs'
import { buildDeenQueue, DEEN_REVIEW_CAP } from './queue'
import { cardId, cardsForItem, facetsFor, lessonCardIds, newDeenCard, parseCardId, seededDeenCard } from './cards'
import { indexTerms, plainText, splitTerms } from './glossary'
import { isDeckVisible } from './load'
import { DECKS, DECK_IDS } from '@/content/deen/registry'
import { reviewSm2 } from '@/lib/spaced-repetition'
import type { DeenCard } from '@/stores/deen-store'
import type { Lesson, NameItem, TextItem } from '@/types/deen'
import core from '../../../content/deen/glossary/core.json'

describe('normalize-arabic', () => {
  it('strips marks and folds alef and hamza seats', () => {
    expect(arabicSkeleton('بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')).toBe('بسم الله الرحمن الرحيم')
    expect(arabicSkeleton('أَإِآ')).toBe('ااا')
    expect(arabicSkeleton('سُئِلَ عَلَى مُؤْمِنٍ،  قَالَ: «نَعَمْ»')).toBe('سيل علي مومن قال نعم')
    expect(isUnvocalised('قال')).toBe(true)
    expect(isUnvocalised('قَالَ')).toBe(false)
  })

  it('the loose form finds a Name inside Uthmani spelling', () => {
    expect(looseSkeleton('ٱلرَّحْمَـٰنِ')).toBe(looseSkeleton('الرحمان'))
  })

  it('the build script carries an identical copy (TS and .mjs never drift)', () => {
    const arabicChar = fc.integer({ min: 0x0600, max: 0x06ff }).map((c) => String.fromCharCode(c))
    const text = fc.array(fc.oneof(arabicChar, fc.constantFrom(' ', '  ', 'ـ', '«', '»', '.', '1', '‏', 'ٱ')), { maxLength: 40 }).map((a) => a.join(''))
    fc.assert(fc.property(text, (s) => {
      expect(build.arabicSkeleton(s)).toBe(arabicSkeleton(s))
      expect(build.looseSkeleton(s)).toBe(looseSkeleton(s))
    }), { numRuns: 500 })
  })
})

const card = (deck: string, over: Partial<DeenCard> = {}): DeenCard => ({ ...newDeenCard(deck, 1, 1000), ...over })

describe('buildDeenQueue', () => {
  const dayEnd = 10_000
  it('due reviews first by due date, capped at 20; new cards capped per day', () => {
    const cards: Record<string, DeenCard> = {}
    for (let i = 0; i < 25; i++) cards[`a:${i}:meaning`] = card('a', { lastReview: 5, repetitions: 1, nextReview: 9000 - i })
    for (let i = 0; i < 8; i++) cards[`b:${i}:meaning`] = card('b', { addedAt: 100 + i })
    cards['a:late:meaning'] = card('a', { lastReview: 5, repetitions: 2, nextReview: dayEnd + 1 })
    cards['a:off:meaning'] = card('a', { lastReview: 5, repetitions: 1, nextReview: 1, suspended: true })

    const q = buildDeenQueue(cards, dayEnd, { newPerDay: 5 })
    expect(q.due).toHaveLength(DEEN_REVIEW_CAP)
    expect(q.dueTotal).toBe(25)
    expect(q.due[0]).toBe('a:24:meaning')
    expect(q.due).not.toContain('a:late:meaning')
    expect(q.due).not.toContain('a:off:meaning')
    expect(q.fresh).toEqual(['b:0:meaning', 'b:1:meaning', 'b:2:meaning', 'b:3:meaning', 'b:4:meaning'])
    expect(q.perDeck).toEqual({ a: { due: 20, fresh: 0 }, b: { due: 0, fresh: 5 } })
  })

  it('counts what was already introduced today, and filters by deck', () => {
    const cards = { 'b:1:meaning': card('b'), 'b:2:meaning': card('b'), 'c:1:meaning': card('c') }
    expect(buildDeenQueue(cards, dayEnd, { newPerDay: 5, introducedToday: 4 }).fresh).toHaveLength(1)
    expect(buildDeenQueue(cards, dayEnd, { newPerDay: 5, introducedToday: 9 }).fresh).toHaveLength(0)
    expect(buildDeenQueue(cards, dayEnd, { newPerDay: 5, decks: ['c'] }).fresh).toEqual(['c:1:meaning'])
  })

  it('cards chosen on purpose (learn and lesson flows) skip the cap; the rest wait and are counted', () => {
    const cards: Record<string, DeenCard> = {}
    for (let i = 0; i < 5; i++) cards[`names:${i}:ar-en`] = card('names', { addedAt: 100 + i })
    for (let i = 0; i < 7; i++) cards[`course:l1:c${i}`] = card('course', { addedAt: 200 + i, chosen: true })
    // Five Names already introduced today: the lesson's seven still come up, the Names wait
    const q = buildDeenQueue(cards, dayEnd, { newPerDay: 5, introducedToday: 5 })
    expect(q.fresh).toHaveLength(7)
    expect(q.waiting).toBe(5)
    expect(buildDeenQueue(cards, dayEnd, { newPerDay: 5, introducedToday: 5, decks: ['course'] }).fresh).toHaveLength(7)
  })

  it('a new card set to start on a later day is not offered yet', () => {
    const q = buildDeenQueue({ x: card('b', { nextReview: dayEnd + 1, chosen: true }) }, dayEnd, { newPerDay: 5 })
    expect(q.fresh).toEqual([])
    expect(q.waiting).toBe(0)
  })

  it('a reviewed card leaves the new pile and schedules through the shared SM-2 core', () => {
    const reviewed = reviewSm2(card('b'), 5)
    expect(reviewed.repetitions).toBe(1)
    expect(reviewed.lastReview).toBeGreaterThan(0)
    expect(buildDeenQueue({ x: reviewed }, dayEnd, { newPerDay: 5 }).fresh).toEqual([])
  })
})

describe('cards', () => {
  const hadith: TextItem = {
    id: '01', deck: 'nawawi40', rev: 2, title: 't', cue: 'c', arabic: 'نص', translation: 'Text.',
    citations: [{ collection: 'bukhari', number: '1', numbering: 'fath-al-bari', narrator: 'Umar' }], gradings: [], review: { status: 'source-checked' },
  }
  it('ids round-trip', () => {
    expect(cardId('nawawi40', '01', 'recall')).toBe('nawawi40:01:recall')
    expect(parseCardId('names99:042:ar-en')).toEqual({ deck: 'names99', itemId: '042', facet: 'ar-en' })
    expect(parseCardId('bad')).toBeNull()
  })

  it('facets follow the deck kind and depth', () => {
    expect(facetsFor('hadith', hadith, { depth: 'arabic' })).toEqual(['recall', 'meaning', 'narrator'])
    expect(facetsFor('hadith', hadith, { depth: 'meaning' })).toEqual(['meaning', 'narrator'])
    expect(facetsFor('dhikr', { ...hadith, citations: [], usage: { when: ['morning'] } }, { depth: 'arabic' })).toEqual(['recall', 'meaning', 'usage'])
    expect(facetsFor('dhikr', { ...hadith, arabic: undefined, translation: undefined, quran: { surahId: 2, ayah: 255 } }, { depth: 'arabic' })).toEqual([])
    expect(facetsFor('names', { id: '001' } as NameItem, { depth: 'meaning' })).toEqual(['ar-en', 'en-ar'])
  })

  it('course cards: the school-free ones, plus the chosen school only', () => {
    const l = { id: 'wudu-02', claims: [{ cards: [{ id: 'c1' }, { id: 'c2', school: 'hanafi' }, { id: 'c3', school: 'shafii' }] }] } as unknown as Lesson
    expect(lessonCardIds('course-purification', l, null)).toEqual(['course-purification:wudu-02:c1'])
    expect(lessonCardIds('course-purification', l, 'shafii')).toEqual(['course-purification:wudu-02:c1', 'course-purification:wudu-02:c3'])
  })

  it('new cards carry deck and item rev; seeded cards are conservative and never beat a real review', () => {
    const made = cardsForItem('nawawi40', 'hadith', hadith, { depth: 'meaning', school: null, now: 5 })
    expect(Object.keys(made)).toEqual(['nawawi40:01:meaning', 'nawawi40:01:narrator'])
    expect(made['nawawi40:01:meaning']).toMatchObject({ deck: 'nawawi40', itemRev: 2, repetitions: 0, lastReview: 0 })
    const seeded = seededDeenCard('adhkar-morning-evening', 1, 3)
    expect(seeded).toMatchObject({ repetitions: 1, lastQuality: 3, lastReview: 0 })
  })
})

describe('glossary', () => {
  it('core has about 40 terms, unique ids, every seeAlso resolves', () => {
    const ids = new Set(core.map((t) => t.id))
    expect(core.length).toBeGreaterThanOrEqual(40)
    expect(ids.size).toBe(core.length)
    for (const t of core) for (const s of t.seeAlso ?? []) expect(ids.has(s), `${t.id} → ${s}`).toBe(true)
  })

  it('splits and flattens [[term]] marks', () => {
    expect(splitTerms('Make [[wudu]] first.')).toEqual([{ text: 'Make ' }, { term: 'wudu' }, { text: ' first.' }])
    expect(plainText('Make [[wudu]] first.', indexTerms(core))).toBe('Make wudu first.')
  })
})

describe('registry', () => {
  it('lists the nine decks of the spec, each with a module', async () => {
    expect(DECK_IDS).toEqual(['nawawi40', 'adhkar-morning-evening', 'adhkar-after-prayer', 'adhkar-sleep-waking', 'duas-daily', 'salah-words', 'names99', 'course-purification', 'course-fasting'])
    for (const d of DECKS) {
      const mod = (await d.module()).default
      expect(typeof mod.ready).toBe('boolean')
    }
    expect(Object.keys(build.DECKS).sort()).toEqual([...DECK_IDS].sort())
  })

  it('hidden: a stub deck, and the course while fiqh is held back', () => {
    const course = DECKS.find((d) => d.id === 'course-fasting')!
    const ready = { ready: true as const, load: async () => ({ deck: 'x', kind: 'course' as const, hash: '', items: [] }) }
    expect(isDeckVisible(course, { ready: false })).toBe(false)
    expect(isDeckVisible(course, ready, true)).toBe(true)
    expect(isDeckVisible(course, ready, false)).toBe(false)
  })
})
