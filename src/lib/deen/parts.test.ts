import { describe, expect, it } from 'vitest'
import type { DeckKind, TextItem } from '@/types/deen'
import nawawi from '@/data/deen/nawawi40.json'
import duas from '@/data/deen/duas-daily.json'
import morning from '@/data/deen/adhkar-morning-evening.json'
import afterPrayer from '@/data/deen/adhkar-after-prayer.json'
import sleep from '@/data/deen/adhkar-sleep-waking.json'
import salah from '@/data/deen/salah-words.json'
import { ORDER_MAX, buildUnits, itemParts, narratorOf, orderBank, orderWords, partGroups } from './parts'
import { afterCheck, recallStages, unitStages } from '@/components/deen/memorise-flow'
import { cueOf } from '@/components/deen/cue-text'
import { seededShuffle } from '@/lib/shuffle'
import { offsetsFromWordEnds, slices, wordSpans } from '../../../scripts/deen-parts.mjs'

const hadith = nawawi.items as unknown as TextItem[]
const adhkar = [duas, morning, afterPrayer, sleep, salah].flatMap((d) => d.items as unknown as TextItem[])
const byId = (list: TextItem[], id: string) => list.find((i) => i.id === id)!

describe('itemParts', () => {
  it('cuts hadith 11 at its authored parts, the name whole, each with its English', () => {
    const parts = itemParts(byId(hadith, '11'))
    expect(parts.map((p) => p.ar)).toEqual([
      'عَنْ أَبِي مُحَمَّدٍ الْحَسَنِ بْنِ عَلِيِّ بْنِ أَبِي طَالِبٍ',
      'سِبْطِ رَسُولِ اللَّهِ ﷺ وَرَيْحَانَتِهِ رَضِيَ اللَّهُ عَنْهُمَا قَالَ:',
      'حَفِظْتُ مِنْ رَسُولِ اللَّهِ ﷺ:',
      '«دَعْ مَا يَرِيبُكَ إِلَى مَا لَا يَرِيبُكَ».',
    ])
    expect(parts.map((p) => p.en)).toEqual([
      'It is narrated from Abu Muhammad al-Hasan ibn Ali ibn Abi Talib,',
      'grandson of the Messenger of Allah ﷺ and his fragrant flower, may Allah be pleased with them both, who said:',
      'I memorised from the Messenger of Allah ﷺ:',
      '“Leave what makes you doubt for what does not make you doubt.”',
    ])
  })

  it('loses and reorders nothing: the parts joined are the text, in both languages', () => {
    const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
    for (const it of [...hadith, ...adhkar]) {
      if (it.quran) continue
      const parts = itemParts(it)
      expect(parts.map((p) => p.ar).join(' '), `${it.deck}:${it.id}`).toBe(flat(it.arabic!))
      if (it.parts) {
        expect(parts.length, `${it.deck}:${it.id}`).toBe(it.parts.ar.length)
        expect(parts.map((p) => p.en).join(' '), `${it.deck}:${it.id}`).toBe(flat(it.translation!))
      } else {
        expect(parts, `${it.deck}:${it.id}`).toEqual([{ ar: flat(it.arabic!), en: flat(it.translation!) }])
      }
    }
  })

  it('never ends a part on the head of a name, in any shipped hadith', () => {
    for (const it of hadith) {
      for (const p of itemParts(it).slice(0, -1)) {
        const last = p.ar.split(' ').pop()!.replace(/[ً-ْٰ]/g, '')
        expect(['بن', 'ابن', 'أبي', 'أبو', 'عبد', 'أم'], `${it.id}: "${p.ar}"`).not.toContain(last)
      }
    }
  })

  it('keeps a text without parts whole, and never cuts on its own', () => {
    const long = Array.from({ length: 40 }, (_, i) => `كلمة${i}`).join(' ')
    expect(itemParts({ arabic: long, translation: 'Forty words.' })).toEqual([{ ar: long, en: 'Forty words.' }])
    expect(itemParts({ arabic: '' })).toEqual([])
    expect(itemParts({ arabic: 'أ ب', translation: undefined })).toEqual([{ ar: 'أ ب', en: null }])
  })

  it('falls back to the whole text when the offsets do not fit it', () => {
    const base = { arabic: 'أ ب ج د', translation: 'One two three four.' }
    expect(itemParts({ ...base, parts: { ar: [3, 99], en: [7, 19] } })).toHaveLength(1)
    expect(itemParts({ ...base, parts: { ar: [3, 2], en: [7, 19] } })).toHaveLength(1)
    // Arabic parts that fit keep their cut; English that does not fit is left out, not guessed
    expect(itemParts({ ...base, parts: { ar: [3, 7], en: [7, 99] } })).toEqual([
      { ar: 'أ ب', en: null },
      { ar: 'ج د', en: null },
    ])
  })
})

describe('partGroups and buildUnits', () => {
  it('groups the parts of hadith 2 by its reading paragraphs', () => {
    const groups = partGroups(byId(hadith, '02'))
    expect(groups.map((g) => g.length)).toEqual([4, 3, 4, 3, 2, 2, 3, 2])
    expect(groups.flat()).toEqual(Array.from({ length: 23 }, (_, i) => i))
  })

  it('is one group when there are no segments', () => {
    expect(partGroups(byId(hadith, '11'))).toEqual([[0, 1, 2, 3]])
  })

  it('walks each part, then the parts of a paragraph together, then all of it', () => {
    expect(buildUnits(0)).toEqual([])
    expect(buildUnits(1)).toEqual([{ kind: 'part', index: 0, label: '' }])
    expect(buildUnits(3, [[0, 1, 2]]).map((u) => u.label)).toEqual(['Part 1 of 3', 'Part 2 of 3', 'Part 3 of 3', 'All together'])
    expect(buildUnits(5, [[0, 1], [2], [3, 4]]).map((u) => u.label)).toEqual([
      'Part 1 of 5',
      'Part 2 of 5',
      'Parts 1 to 2 together',
      'Part 3 of 5',
      'Part 4 of 5',
      'Part 5 of 5',
      'Parts 4 to 5 together',
      'All together',
    ])
    const last = buildUnits(5, [[0, 1], [2], [3, 4]]).pop()
    expect(last).toMatchObject({ kind: 'chain', from: 0, to: 4, whole: true })
  })
})

describe('the put-in-order tiles', () => {
  it('drops edge punctuation and keeps an honorific with its word', () => {
    expect(orderWords('حَفِظْتُ مِنْ رَسُولِ اللَّهِ ﷺ: «دَعْ مَا يَرِيبُكَ».')).toEqual(['حَفِظْتُ', 'مِنْ', 'رَسُولِ', 'اللَّهِ ﷺ', 'دَعْ', 'مَا', 'يَرِيبُكَ'])
    expect(orderWords('قَالَ تَعَالَى: ﴿يَا أَيُّهَا الرُّسُلُ﴾،')).toEqual(['قَالَ', 'تَعَالَى', 'يَا', 'أَيُّهَا', 'الرُّسُلُ'])
    expect(orderWords('')).toEqual([])
  })

  it('offers every word up to twelve, and only the last twelve of a longer part', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`)
    expect(orderBank(words(2))).toBeNull()
    expect(orderBank(words(3))).toEqual({ lead: [], bank: words(3) })
    expect(orderBank(words(12))!.lead).toEqual([])
    const long = orderBank(words(14))!
    expect(long.lead).toEqual(['w0', 'w1'])
    expect(long.bank).toHaveLength(ORDER_MAX)
    expect([...long.lead, ...long.bank]).toEqual(words(14))
  })

  it('gives every shipped part a bank of three to twelve tiles', () => {
    for (const it of [...hadith, ...adhkar]) {
      if (it.quran || !it.parts) continue
      for (const p of itemParts(it)) {
        const bank = orderBank(orderWords(p.ar))
        expect(bank, `${it.deck}:${it.id} "${p.ar}"`).not.toBeNull()
        expect(bank!.bank.length, `${it.deck}:${it.id}`).toBeGreaterThanOrEqual(3)
        expect(bank!.bank.length, `${it.deck}:${it.id}`).toBeLessThanOrEqual(ORDER_MAX)
      }
    }
  })

  it('shuffles the same way for the same seed, and never into the right order', () => {
    const tiles = ['a', 'b', 'c', 'd', 'e']
    expect(seededShuffle(tiles, 'x/1')).toEqual(seededShuffle(tiles, 'x/1'))
    expect([...seededShuffle(tiles, 'x/1')].sort()).toEqual(tiles)
    for (let i = 0; i < 50; i++) expect(seededShuffle(tiles, `seed${i}`)).not.toEqual(tiles)
    expect(seededShuffle(['a', 'b'], 'any')).toEqual(['b', 'a'])
  })
})

describe('the first-letter cue of a quoted word', () => {
  it('cues the first letter, not the opening quote mark', () => {
    expect(cueOf('«دَعْ')).toBe('«دَ')
    expect(cueOf('﴿يَا')).toMatch(/^﴿يَ/)
    expect(cueOf('مَا')).toBe('مَـ')
    expect(cueOf('ﷺ')).toBe('ﷺ')
    expect(cueOf('ﷺ:')).toBe('ﷺ:')
  })
})

describe('the Build and Recall routes', () => {
  it('a part is read, cued, ordered, hidden and checked; parts together go straight to memory', () => {
    expect(unitStages({ chain: false, canOrder: true })).toEqual(['read', 'cue', 'order', 'hidden', 'check'])
    expect(unitStages({ chain: false, canOrder: false })).toEqual(['read', 'cue', 'hidden', 'check'])
    expect(unitStages({ chain: true, canOrder: false })).toEqual(['hidden', 'check'])
  })

  it('only "Got it" moves on; anything else is another go', () => {
    expect(afterCheck('got-it', false)).toBe('next')
    expect(afterCheck('hesitated', false)).toBe('cue')
    expect(afterCheck('missed', false)).toBe('cue')
    expect(afterCheck('missed', true)).toBe('hidden')
  })

  it('asks for the Arabic, the meaning, then the narrator of a hadith', () => {
    const h11 = byId(hadith, '11')
    expect(narratorOf(h11)).toBe('al-Hasan ibn Ali')
    expect(recallStages(h11, 'hadith', 'arabic')).toEqual(['arabic', 'meaning', 'narrator'])
    expect(recallStages(h11, 'hadith', 'meaning')).toEqual(['meaning', 'narrator'])
    expect(recallStages({ ...h11, citations: [] }, 'hadith', 'arabic')).toEqual(['arabic', 'meaning'])
  })

  it('asks when a dua is said in place of its narrator', () => {
    const dua = byId(adhkar, 'istikhara')
    const kind: DeckKind = 'dhikr'
    expect(recallStages(dua, kind, 'arabic')).toEqual(['arabic', 'meaning', 'usage'])
    expect(recallStages(dua, kind, 'meaning')).toEqual(['meaning', 'usage'])
    expect(recallStages({ ...dua, usage: undefined }, kind, 'meaning')).toEqual(['meaning'])
  })
})

describe('the parts authoring tool', () => {
  const text = 'One two,  three\n\nfour five.'
  it('turns last-word numbers into end offsets, the last one the end of the text', () => {
    expect(wordSpans(text).map((s: { word: string }) => s.word)).toEqual(['One', 'two,', 'three', 'four', 'five.'])
    const ends = offsetsFromWordEnds(text, [2, 3, 5])
    expect(ends).toEqual([8, 15, text.length])
    expect(slices(text, ends)).toEqual(['One two,', 'three', 'four five.'])
  })
  it('refuses a word number outside the text', () => {
    expect(() => offsetsFromWordEnds(text, [2, 9])).toThrow(/out of range/)
  })
})
