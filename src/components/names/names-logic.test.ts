import { describe, expect, it } from 'vitest'
import { newDeenCard } from '@/lib/deen/cards'
import { buildDeenQueue } from '@/lib/deen/queue'
import type { DeenCard } from '@/stores/deen-store'
import type { NameItem } from '@/types/deen'
import {
  EVIDENCE_LABEL,
  NAMES_DECK,
  batchSize,
  cardsForNames,
  depthChange,
  learnStatus,
  nameFacets,
  namesReadiness,
  namesStartedSince,
  nextNames,
  readerHref,
  refLabel,
  sortNames,
  startedNameIds,
  unseenNameCards,
} from './names-logic'

const name = (order: number, kind: NameItem['evidence']['kind'] = 'quran-name'): NameItem => ({
  id: String(order).padStart(3, '0'),
  rev: 1,
  order,
  arabic: 'ٱلْمَلِكُ',
  transliteration: `Name ${order}`,
  meaning: 'meaning',
  explanation: '',
  evidence: { kind },
  review: { status: 'source-checked' },
})
const items = Array.from({ length: 12 }, (_, i) => name(i + 1))
const NOW = new Date(2026, 10, 14, 9).getTime()
const DAY_START = new Date(2026, 10, 14).getTime()

describe('nameFacets', () => {
  it('learns the meaning by default, and both directions when memorising the Arabic', () => {
    expect(nameFacets('meaning')).toEqual(['ar-en'])
    expect(nameFacets('arabic')).toEqual(['ar-en', 'en-ar'])
  })
})

describe('batchSize', () => {
  it('is 5 by default and follows the learner\'s daily new-card number', () => {
    expect(batchSize(undefined)).toBe(5)
    expect(batchSize(0)).toBe(5)
    expect(batchSize(5)).toBe(5)
    expect(batchSize(8)).toBe(8)
  })
})

describe('starting Names', () => {
  it('takes the next Names in list order, skipping any already started', () => {
    expect(nextNames(items, {}, 5).map((n) => n.order)).toEqual([1, 2, 3, 4, 5])
    const cards = cardsForNames([items[0], items[2]], 'meaning', NOW)
    expect(nextNames([...items].reverse(), cards, 3).map((n) => n.order)).toEqual([2, 4, 5])
    expect(nextNames(items.slice(0, 2), cardsForNames(items.slice(0, 2), 'meaning', NOW), 5)).toEqual([])
  })

  it('makes one card per Name for the meaning, two for the Arabic, new and due today', () => {
    const meaning = cardsForNames(items.slice(0, 5), 'meaning', NOW)
    expect(Object.keys(meaning)).toEqual(['names99:001:ar-en', 'names99:002:ar-en', 'names99:003:ar-en', 'names99:004:ar-en', 'names99:005:ar-en'])
    const arabic = cardsForNames(items.slice(0, 5), 'arabic', NOW)
    expect(Object.keys(arabic)).toHaveLength(10)
    for (const c of Object.values(arabic)) {
      expect(c.deck).toBe(NAMES_DECK)
      expect(c.lastReview).toBe(0)
      expect(c.repetitions).toBe(0)
      expect(c.nextReview).toBeLessThanOrEqual(NOW)
    }
  })

  it('queues the five new Names in list order for today', () => {
    const cards = cardsForNames(items.slice(0, 5), 'meaning', NOW)
    const q = buildDeenQueue(cards, DAY_START + 86_399_999, { newPerDay: 5 })
    expect(q.fresh).toEqual(['names99:001:ar-en', 'names99:002:ar-en', 'names99:003:ar-en', 'names99:004:ar-en', 'names99:005:ar-en'])
  })

  it('counts the Names started today, not the cards', () => {
    const old = cardsForNames(items.slice(0, 2), 'arabic', DAY_START - 1000)
    const fresh = cardsForNames(items.slice(2, 5), 'arabic', NOW)
    const cards = { ...old, ...fresh }
    expect(startedNameIds(cards)).toEqual(new Set(['001', '002', '003', '004', '005']))
    expect(namesStartedSince(cards, DAY_START)).toBe(3)
    // Another deck's cards don't count
    expect(namesStartedSince({ 'nawawi40:01:recall': newDeenCard('nawawi40', 1, NOW) }, DAY_START)).toBe(0)
  })
})

describe('what the reviews will show', () => {
  const DAY_END = DAY_START + 86_399_999
  const ISO = '2026-11-14'

  it('has all five ready at the meaning depth', () => {
    const cards = cardsForNames(items.slice(0, 5), 'meaning', NOW)
    expect(namesReadiness({ cards, newPerDay: 5, introduced: {} }, DAY_END)).toEqual({ ready: 5, waiting: 0 })
  })

  it('holds the cards past the daily new-card number for a later day', () => {
    const cards = cardsForNames(items.slice(0, 5), 'arabic', NOW)
    expect(namesReadiness({ cards, newPerDay: 5, introduced: {} }, DAY_END)).toEqual({ ready: 5, waiting: 5 })
    // Another deck's new cards already seen today leave no room
    expect(namesReadiness({ cards, newPerDay: 5, introduced: { [ISO]: 5 } }, DAY_END)).toEqual({ ready: 0, waiting: 10 })
  })

  it('counts due reviews as ready, and leaves out paused cards and other decks', () => {
    const cards: Record<string, DeenCard> = cardsForNames(items.slice(0, 2), 'arabic', DAY_START - 86_400_000)
    cards['names99:001:ar-en'] = { ...cards['names99:001:ar-en'], lastReview: DAY_START - 80_000_000, repetitions: 1, interval: 1, nextReview: DAY_START }
    cards['names99:001:en-ar'] = { ...cards['names99:001:en-ar'], suspended: true }
    cards['nawawi40:01:recall'] = newDeenCard('nawawi40', 1, NOW)
    expect(namesReadiness({ cards, newPerDay: 1, introduced: {} }, DAY_END)).toEqual({ ready: 2, waiting: 1 })
    expect(namesReadiness({ cards: {}, newPerDay: 5, introduced: {} }, DAY_END)).toEqual({ ready: 0, waiting: 0 })
  })

  it('says only what the session will show', () => {
    expect(learnStatus({ today: 5, ready: 5, waiting: 0 })).toBe('5 new Names today. They are waiting in your reviews.')
    expect(learnStatus({ today: 1, ready: 1, waiting: 0 })).toBe('1 new Name today. It is waiting in your reviews.')
    expect(learnStatus({ today: 5, ready: 5, waiting: 5 })).toBe('5 new Names today. 5 cards are ready now; the rest follow on the coming days.')
    expect(learnStatus({ today: 5, ready: 0, waiting: 5 })).toBe('5 new Names today. Their cards come into your reviews on the coming days.')
    expect(learnStatus({ today: 5, ready: 0, waiting: 0 })).toBe('5 new Names today. You have been through them. They come back in your reviews.')
    expect(learnStatus({ today: 1, ready: 0, waiting: 0 })).toBe('1 new Name today. You have been through it. It comes back in your reviews.')
    expect(learnStatus({ today: 0, ready: 0, waiting: 4 })).toBe('The cards come into your reviews on the coming days.')
    expect(learnStatus({ today: 0, ready: 1, waiting: 0 })).toBe('1 card is ready in your reviews.')
    expect(learnStatus({ today: 0, ready: 3, waiting: 2 })).toBe('3 cards are ready now; the rest follow on the coming days.')
    for (const t of [0, 1, 5]) for (const r of [0, 1, 4]) for (const w of [0, 3]) expect(learnStatus({ today: t, ready: r, waiting: w })).not.toMatch(/missed|behind|overdue|late/i)
  })
})

describe('depthChange', () => {
  it('adds the en-ar card for started Names when moving to the Arabic', () => {
    const cards = cardsForNames(items.slice(0, 3), 'meaning', NOW)
    const c = depthChange(cards, items, 'arabic', NOW)
    expect(Object.keys(c.add)).toEqual(['names99:001:en-ar', 'names99:002:en-ar', 'names99:003:en-ar'])
    expect(c.suspend).toEqual([])
  })

  it('pauses en-ar cards when moving back to the meaning, and wakes them again later', () => {
    const cards: Record<string, DeenCard> = cardsForNames(items.slice(0, 2), 'arabic', NOW)
    const back = depthChange(cards, items, 'meaning', NOW)
    expect(back.suspend).toEqual(['names99:001:en-ar', 'names99:002:en-ar'])
    expect(back.add).toEqual({})
    for (const id of back.suspend) cards[id] = { ...cards[id], suspended: true }
    const again = depthChange(cards, items, 'arabic', NOW)
    expect(again.resume).toEqual(['names99:001:en-ar', 'names99:002:en-ar'])
    expect(again.add).toEqual({})
  })
})

describe('labels and links', () => {
  it('labels every evidence kind, list-only plainly', () => {
    expect(EVIDENCE_LABEL['list-only'].short).toBe('List only')
    expect(Object.keys(EVIDENCE_LABEL).sort()).toEqual(['hadith', 'list-only', 'quran-derived', 'quran-name'])
  })

  it('opens the reader at the ayah', () => {
    expect(readerHref({ surahId: 59, ayah: 23 })).toBe('/listen?s=59&a=23')
    expect(refLabel({ surahId: 59, ayah: 23 })).toBe('59:23')
    expect(refLabel({ surahId: 55, ayah: 26, ayahEnd: 27 })).toBe('55:26-27')
  })

  it('sorts a deck\'s items into list order', () => {
    expect(sortNames([name(3), name(1), name(2)]).map((n) => n.order)).toEqual([1, 2, 3])
  })
})

describe('unseenNameCards', () => {
  it('counts Names cards not yet seen, leaving out paused ones, seen ones and other decks', () => {
    const fresh = newDeenCard(NAMES_DECK, 1, NOW)
    const seen: DeenCard = { ...fresh, lastReview: NOW, repetitions: 1 }
    const cards: Record<string, DeenCard> = {
      'names99:001:ar-en': fresh,
      'names99:002:ar-en': seen,
      'names99:003:en-ar': { ...fresh, suspended: true },
      'nawawi40:01:recall': newDeenCard('nawawi40', 1, NOW),
    }
    expect(unseenNameCards(cards)).toBe(1)
    expect(unseenNameCards({})).toBe(0)
  })
})
