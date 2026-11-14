import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addLocalDays, endOfDayMs, isoFromMs, startOfDayMs } from '@/lib/dates'
import { newDeenCard, termCard } from '@/lib/deen/cards'
import { reviewSm2 } from '@/lib/spaced-repetition'
import type { DeenCard } from '@/stores/deen-store'
import type { Position, TextItem } from '@/types/deen'
import { deenToday, reviewedToday } from './queue-logic'
import { deckStatesOf, itemStateOf, stateOfCards, STRONG_INTERVAL_DAYS } from './item-state'
import { correctionDate, formatIsoDate, gradingText, mailtoHref, reportMessage, splitSegments } from './text'
import { citationText, humanizeId, numberingLabel, sunnahComUrl } from './registry-names'
import { orderPositions } from './positions-table'
import { deckIdForSelection, errataBody, notIncludedSection } from './sources-data'
import { foldLatin, matchesTerm } from './glossary-search'
import { cardsForMemorise } from './memorise-flow'
import { reviewStatusText } from './review-badge'
import { correctionNote, whenLabel } from './session-player'
import { resolveDepth } from './depth-choice'
import { learnHref, sessionHref } from './links'
import { UNREVIEWED_STATUS } from '@/lib/deen/flags'

const NOW = new Date(2026, 10, 13, 10, 0).getTime()
const DAY_END = endOfDayMs(NOW)
const TODAY = isoFromMs(NOW)

/** A reviewed card due at `due` */
function reviewed(deck: string, due: number, interval = 3): DeenCard {
  return { ...newDeenCard(deck, 1, NOW - 30 * 86400000), repetitions: 2, interval, lastReview: NOW - 86400000, lastQuality: 4, nextReview: due }
}
const fresh = (deck: string, addedAt: number): DeenCard => newDeenCard(deck, 1, addedAt)
const data = (cards: Record<string, DeenCard>, introduced: Record<string, number> = {}, newPerDay = 5) => ({ cards, introduced, newPerDay })

const fixtureItem = (n: string) => JSON.parse(readFileSync(join(__dirname, '../../../content/deen/_fixture/items', `${n}.json`), 'utf8')) as TextItem

describe('the deen queue (useDeenQueue logic)', () => {
  it('caps reviews at 20 a day and reports the true due total', () => {
    const cards: Record<string, DeenCard> = {}
    for (let i = 0; i < 30; i++) cards[`nawawi40:${String(i).padStart(2, '0')}:meaning`] = reviewed('nawawi40', startOfDayMs(NOW) - i * 86400000)
    const q = deenToday(data(cards), DAY_END, ['nawawi40'])
    expect(q.due).toHaveLength(20)
    expect(q.dueTotal).toBe(30)
    expect(q.perDeck.nawawi40.due).toBe(20)
  })

  it('puts the most overdue first, then new cards in the order they were added', () => {
    const cards = {
      'nawawi40:01:meaning': reviewed('nawawi40', startOfDayMs(NOW) - 1 * 86400000),
      'nawawi40:02:meaning': reviewed('nawawi40', startOfDayMs(NOW) - 9 * 86400000),
      'nawawi40:03:meaning': reviewed('nawawi40', startOfDayMs(NOW)),
      'nawawi40:04:meaning': fresh('nawawi40', NOW - 2000),
      'nawawi40:05:meaning': fresh('nawawi40', NOW - 5000),
    }
    const q = deenToday(data(cards), DAY_END, ['nawawi40'])
    expect(q.order).toEqual(['nawawi40:02:meaning', 'nawawi40:01:meaning', 'nawawi40:03:meaning', 'nawawi40:05:meaning', 'nawawi40:04:meaning'])
  })

  it('paces new cards: newPerDay less those already introduced today, fresh again tomorrow', () => {
    const cards: Record<string, DeenCard> = {}
    for (let i = 0; i < 12; i++) cards[`names99:${String(i).padStart(3, '0')}:ar-en`] = fresh('names99', NOW + i)
    expect(deenToday(data(cards), DAY_END, ['names99']).fresh).toHaveLength(5)
    expect(deenToday(data(cards, { [TODAY]: 3 }), DAY_END, ['names99']).fresh).toHaveLength(2)
    expect(deenToday(data(cards, { [TODAY]: 9 }), DAY_END, ['names99']).fresh).toHaveLength(0)
    // Tomorrow, yesterday's count no longer holds new cards back
    const tomorrowEnd = endOfDayMs(addLocalDays(NOW, 1))
    expect(deenToday(data(cards, { [TODAY]: 9 }), tomorrowEnd, ['names99']).fresh).toHaveLength(5)
    expect(deenToday(data(cards, {}, 2), DAY_END, ['names99']).fresh).toHaveLength(2)
  })

  it('truncates at the end of the local day: due any time today is due, tomorrow is not', () => {
    const cards = {
      'nawawi40:01:recall': reviewed('nawawi40', DAY_END),
      'nawawi40:02:recall': reviewed('nawawi40', DAY_END + 1),
      'nawawi40:03:recall': reviewed('nawawi40', startOfDayMs(addLocalDays(NOW, 3))),
    }
    const q = deenToday(data(cards), DAY_END, ['nawawi40'])
    expect(q.due).toEqual(['nawawi40:01:recall'])
    expect(q.nextDue).toBe(DAY_END + 1)
    // The next day the second one is due too
    expect(deenToday(data(cards), endOfDayMs(addLocalDays(NOW, 1)), ['nawawi40']).due).toHaveLength(2)
  })

  it('counts only live decks and the glossary, skips suspended cards, and narrows to ?deck=', () => {
    const cards = {
      'nawawi40:01:meaning': fresh('nawawi40', NOW),
      'names99:001:ar-en': fresh('names99', NOW + 1),
      'adhkar-sleep-waking:01:recall': fresh('adhkar-sleep-waking', NOW + 2),
      'nawawi40:02:meaning': { ...fresh('nawawi40', NOW + 3), suspended: true },
      ...termCard('wudu', NOW + 4),
    }
    const q = deenToday(data(cards), DAY_END, ['nawawi40', 'names99'])
    expect(q.order).toEqual(['nawawi40:01:meaning', 'names99:001:ar-en', 'glossary:wudu:term'])
    expect(q.cardCount).toBe(3)
    expect(deenToday(data(cards), DAY_END, ['nawawi40', 'names99'], 'names99').order).toEqual(['names99:001:ar-en'])
    // A deck that isn't live gives nothing, even when asked for by name
    expect(deenToday(data(cards), DAY_END, ['nawawi40'], 'adhkar-sleep-waking').order).toEqual([])
  })

  it('the 20-review cap is for the whole day, not each session', () => {
    const cards: Record<string, DeenCard> = {}
    for (let i = 0; i < 30; i++) cards[`nawawi40:${String(i).padStart(2, '0')}:meaning`] = reviewed('nawawi40', NOW - (40 - i) * 86400000)
    const first = deenToday(data(cards), DAY_END, ['nawawi40'])
    expect(first.due).toHaveLength(20)
    // Rate the first session's 20, and one brand-new card on top (an introduction, not a review)
    for (const id of first.due) cards[id] = reviewSm2({ ...cards[id] }, 5)
    for (const id of first.due) cards[id].lastReview = NOW
    cards['nawawi40:99:meaning'] = { ...reviewSm2(fresh('nawawi40', NOW), 5), lastReview: NOW }
    const d = data(cards, { [TODAY]: 1 })
    expect(reviewedToday(d, DAY_END)).toBe(20)
    const second = deenToday(d, DAY_END, ['nawawi40'])
    expect(second.due).toEqual([])
    expect(second.dueTotal).toBe(10)
    // Tomorrow the ten that waited come up
    const tomorrow = endOfDayMs(addLocalDays(NOW, 1))
    expect(deenToday(d, tomorrow, ['nawawi40']).due).toHaveLength(10)
    // A narrowed session shares the same daily cap
    cards['names99:001:ar-en'] = reviewed('names99', NOW - 86400000)
    expect(deenToday(data(cards, { [TODAY]: 1 }), DAY_END, ['nawawi40', 'names99'], 'names99').due).toEqual([])
  })

  it('a rated card leaves today and comes back on its SM-2 date', () => {
    const id = 'nawawi40:01:meaning'
    const card = fresh('nawawi40', NOW)
    expect(deenToday(data({ [id]: card }), DAY_END, ['nawawi40']).order).toEqual([id])
    const after = reviewSm2({ ...card, lastReview: NOW }, 5)
    const cards = { [id]: { ...after, lastReview: NOW } }
    expect(deenToday(data(cards, { [TODAY]: 1 }), DAY_END, ['nawawi40']).order).toEqual([])
    const back = endOfDayMs(after.nextReview)
    expect(deenToday(data(cards, { [TODAY]: 1 }), back, ['nawawi40']).order).toEqual([id])
  })
})

describe('item state', () => {
  it('is new, learning, due or strong', () => {
    expect(stateOfCards([], DAY_END)).toBe('new')
    expect(stateOfCards([fresh('d', NOW)], DAY_END)).toBe('learning')
    expect(stateOfCards([reviewed('d', DAY_END - 5)], DAY_END)).toBe('due')
    expect(stateOfCards([reviewed('d', DAY_END + 5, STRONG_INTERVAL_DAYS)], DAY_END)).toBe('strong')
    expect(stateOfCards([reviewed('d', DAY_END + 5, STRONG_INTERVAL_DAYS), reviewed('d', DAY_END + 5, 4)], DAY_END)).toBe('learning')
  })

  it('reads an item by id prefix, ignoring suspended cards and look-alike ids', () => {
    const cards = {
      'nawawi40:01:recall': reviewed('nawawi40', DAY_END - 1),
      'nawawi40:010:recall': fresh('nawawi40', NOW),
      'nawawi40:02:meaning': { ...reviewed('nawawi40', DAY_END - 1), suspended: true },
    }
    expect(itemStateOf(cards, 'nawawi40', '01', DAY_END)).toBe('due')
    expect(itemStateOf(cards, 'nawawi40', '010', DAY_END)).toBe('learning')
    expect(itemStateOf(cards, 'nawawi40', '02', DAY_END)).toBe('new')
    expect(deckStatesOf(cards, 'nawawi40', DAY_END)).toEqual({ '01': 'due', '010': 'learning' })
  })
})

describe('memorise: which cards an item adds', () => {
  const item = fixtureItem('01')
  it('"Know the meaning" adds only the meaning card', () => {
    expect(Object.keys(cardsForMemorise('_fixture', 'hadith', item, 'meaning', NOW))).toEqual(['_fixture:01:meaning'])
  })
  it('"Memorise the Arabic" adds every facet the item has', () => {
    expect(Object.keys(cardsForMemorise('_fixture', 'hadith', item, 'arabic', NOW)).sort()).toEqual(['_fixture:01:meaning', '_fixture:01:narrator', '_fixture:01:recall'])
    expect(Object.keys(cardsForMemorise('_fixture', 'dhikr', item, 'arabic', NOW)).sort()).toEqual(['_fixture:01:meaning', '_fixture:01:recall', '_fixture:01:usage'])
  })
  it('a Quranic item adds no deen cards (its ayahs go to the Quran review)', () => {
    expect(cardsForMemorise('_fixture', 'dhikr', fixtureItem('02'), 'arabic', NOW)).toEqual({})
  })
  it('new cards are due today and carry the item rev', () => {
    const c = Object.values(cardsForMemorise('_fixture', 'hadith', { ...item, rev: 3 }, 'meaning', NOW))[0]
    expect(c).toMatchObject({ itemRev: 3, repetitions: 0, lastReview: 0, deck: '_fixture' })
    expect(c.nextReview).toBeLessThanOrEqual(DAY_END)
  })
})

describe('text helpers', () => {
  it('splits authored segments without cutting a word', () => {
    const item = fixtureItem('01')
    const parts = splitSegments(item.arabic!, item.segments)
    expect(parts).toEqual(['هَذَا نَصٌّ تَجْرِيبِيٌّ', 'لِلِاخْتِبَارِ فَقَطْ'])
    expect(parts.join(' ')).toBe(item.arabic)
    expect(splitSegments('أ ب ج')).toEqual(['أ ب ج'])
    expect(splitSegments('أ ب ج', [1, 3])).toEqual(['أ', 'ب', 'ج'])
    expect(splitSegments('')).toEqual([])
  })

  it('finds the newest errata date for an item, exactly', () => {
    const errata = [
      '- 2026-12-01 · nawawi40:02 rev 2: a word fixed',
      '- 2027-01-05 · nawawi40:02 rev 3: the number',
      '- 2027-02-01 · nawawi40:020 rev 2: another item',
    ].join('\n')
    expect(correctionDate(errata, 'nawawi40', '02')).toBe('2027-01-05')
    expect(correctionDate(errata, 'nawawi40', '03')).toBeNull()
    expect(formatIsoDate('2027-01-05')).toBe('5 January 2027')
  })

  it('names the collection, number and numbering scheme', () => {
    expect(citationText({ collection: 'muslim', number: '2723', numbering: 'abd-al-baqi' })).toBe("Sahih Muslim 2723 (Abd al-Baqi numbering)")
    expect(numberingLabel('fath-al-bari')).toBe('Fath al-Bari numbering')
    expect(numberingLabel('unknown-scheme')).toBe('Unknown scheme numbering')
    expect(humanizeId('fixture-sahih')).toBe('Fixture sahih')
    expect(numberingLabel('fixture-numbering')).toBe('Fixture numbering')
  })

  it('links to Sunnah.com only when the link is derivable', () => {
    expect(sunnahComUrl({ collection: 'bukhari', number: '1', numbering: 'fath-al-bari' })).toBe('https://sunnah.com/bukhari:1')
    expect(sunnahComUrl({ collection: 'abu-dawud', number: '4607', numbering: 'muhyi-al-din-abd-al-hamid' })).toBe('https://sunnah.com/abudawud:4607')
    expect(sunnahComUrl({ collection: 'bukhari', number: '1', numbering: 'some-other' })).toBeNull()
    expect(sunnahComUrl({ collection: 'fixture-sahih', number: '1', numbering: 'fixture-numbering' })).toBeNull()
    expect(sunnahComUrl({ collection: 'muslim', number: '1, 2', numbering: 'abd-al-baqi' })).toBeNull()
  })

  it('attributes a grading to its scholar and work', () => {
    expect(gradingText({ grade: 'hasan', by: 'al-tirmidhi', in: "al-Jami', after the hadith" })).toBe("Hasan: al-Tirmidhi, in al-Jami', after the hadith")
    expect(gradingText({ grade: 'sahih', by: 'al-nawawi', in: 'al-adhkar' })).toBe('Sahih: al-Nawawi, in al-Adhkar')
  })

  it('prefills a problem report with the item id and rev', () => {
    const m = reportMessage('nawawi40:01', 2, 'Actions are by intentions')
    expect(m.subject).toBe('Takrar: a problem with nawawi40:01 (rev 2)')
    expect(m.body).toContain('Item: nawawi40:01')
    expect(m.body).toContain('Revision: 2')
    expect(mailtoHref('a@b.c', m)).toMatch(/^mailto:a@b\.c\?subject=Takrar%3A%20a%20problem/)
  })
})

describe('trust surfaces', () => {
  it('the status line is honest until a reviewer is named', () => {
    expect(reviewStatusText({ status: 'source-checked' })).toBe(UNREVIEWED_STATUS)
    expect(reviewStatusText({ status: 'scholar-reviewed' })).toBe(UNREVIEWED_STATUS)
    expect(reviewStatusText({ status: 'scholar-reviewed', by: ['shaykh-x'], date: '2027-03-01' })).toBe('Reviewed by shaykh-x, 1 March 2027.')
  })

  it("puts the user's school first and never drops another", () => {
    const pos = (school: Position['school']): Position => ({ school, text: school, source: { work: 'w', location: 'l' } })
    const all = [pos('hanbali'), pos('hanafi'), pos('shafii'), pos('maliki')]
    expect(orderPositions(all, null).map((p) => p.school)).toEqual(['hanafi', 'maliki', 'shafii', 'hanbali'])
    expect(orderPositions(all, 'shafii').map((p) => p.school)).toEqual(['shafii', 'hanafi', 'maliki', 'hanbali'])
  })

  it('shows a correction note once the item rev has risen', () => {
    const item = { ...fixtureItem('01'), rev: 2, review: { status: 'source-checked' as const } }
    const content = { kind: 'hadith' as const, facet: 'meaning', item, rev: 2 }
    expect(correctionNote(content, 2, '')).toBeNull()
    expect(correctionNote(content, 1, '')).toBe('Text corrected since you learned it.')
    expect(correctionNote(content, 1, '- 2026-12-01 · _fixture:01 rev 2: fixed')).toBe('Text corrected on 1 December 2026.')
    // Names and lessons have no deck field: the deck comes from the card id
    const name = { kind: 'names' as const, facet: 'ar-en', rev: 2, item: { id: '001', rev: 2, review: { status: 'source-checked' as const } } as never }
    expect(correctionNote(name, 1, '- 2026-12-02 · names99:001 rev 2: fixed', 'names99')).toBe('Text corrected on 2 December 2026.')
  })

  it('says when the next card comes back in calendar days', () => {
    const today = isoFromMs(NOW)
    expect(whenLabel(startOfDayMs(addLocalDays(NOW, 1)), today)).toBe('tomorrow')
    expect(whenLabel(startOfDayMs(addLocalDays(NOW, 3)), today)).toBe('in 3 days')
    expect(whenLabel(startOfDayMs(NOW), today)).toBe('later today')
  })

  it('depth: the learner’s choice, else the deck default, else ask', () => {
    expect(resolveDepth('meaning', 'arabic')).toBe('meaning')
    expect(resolveDepth(undefined, 'arabic')).toBe('arabic')
    expect(resolveDepth(undefined, null)).toBeNull()
  })

  it('builds the learn and session addresses', () => {
    expect(learnHref('nawawi40', '01')).toBe('/review/deen?learn=nawawi40%3A01')
    expect(learnHref('nawawi40', '01', 'meaning')).toBe('/review/deen?learn=nawawi40%3A01&depth=meaning')
    expect(sessionHref('names99')).toBe('/review/deen?deck=names99')
  })
})

describe('/sources and /glossary data', () => {
  it('takes the "not included" section from a SELECTION.md', () => {
    const md = '# Selection\n\nWhy these.\n\n## Not included, and why\n\n- Item A: weak by all located.\n\n### Detail\nMore.\n\n## Order\n\nOther.'
    expect(notIncludedSection(md)).toBe('- Item A: weak by all located.\n\n## Detail\nMore.')
    expect(notIncludedSection('# Selection\n\nNothing else.')).toBeNull()
  })

  it('reads errata entries, and treats the seeded file as empty', () => {
    const seeded = readFileSync(join(__dirname, '../../../content/deen/ERRATA.md'), 'utf8')
    expect(errataBody(seeded)).toBeNull()
    expect(errataBody(seeded.replace('No corrections yet.', '- 2026-12-01 · nawawi40:02 rev 2: a word fixed'))).toBe('- 2026-12-01 · nawawi40:02 rev 2: a word fixed')
  })

  it('maps a SELECTION.md path to its deck', () => {
    expect(deckIdForSelection('nawawi40/SELECTION.md')).toBe('nawawi40')
    expect(deckIdForSelection('adhkar\\duas-daily\\SELECTION.md')).toBe('duas-daily')
    expect(deckIdForSelection('course/purification/SELECTION.md')).toBe('course-purification')
  })

  it('finds terms by any spelling', () => {
    const t = { id: 'daif', arabic: 'ضعيف', translit: 'da’if', short: 'Weak.' }
    expect(foldLatin("Da'if")).toBe('daif')
    expect(matchesTerm(t, "da'if")).toBe(true)
    expect(matchesTerm(t, 'DAIF')).toBe(true)
    expect(matchesTerm(t, 'weak')).toBe(true)
    expect(matchesTerm(t, 'ضَعِيف')).toBe(true)
    expect(matchesTerm(t, 'strong')).toBe(false)
  })
})
