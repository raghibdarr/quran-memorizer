import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { forceTabularForTests, fromHijri, toHijri } from './convert'
import { addDays, monthBounds } from './calendar'
import {
  HIJRI_EVENTS,
  daysUntil,
  eventsOn,
  eventsOnHijri,
  formatQuranLead,
  noVoluntaryFastMark,
  occurrencesInMonth,
  upcomingOccasions,
  validateEvents,
  type HijriEvent,
} from './events'

afterEach(() => forceTabularForTests(false))

const ids = (es: HijriEvent[]) => es.map((e) => e.id).sort()

describe('the events list', () => {
  it('is sound', () => {
    expect(validateEvents(HIJRI_EVENTS)).toEqual([])
  })

  it('has exactly the occasions with a cited act of worship (the brief)', () => {
    expect(ids([...HIJRI_EVENTS])).toEqual(
      ['arafah', 'ashura', 'dhul-hijjah-ten', 'eid-al-adha', 'eid-al-fitr', 'last-ten-nights', 'mon-thu', 'ramadan', 'six-shawwal', 'tashriq', 'tasua', 'white-days'].sort(),
    )
  })

  it('lists no disputed observance', () => {
    const text = JSON.stringify(HIJRI_EVENTS).toLowerCase()
    for (const w of ['mawlid', 'milad', 'isra', "mi'raj", 'miraj', "sha'ban", 'shaban', 'raghaib', 'new year', 'hijri new']) {
      expect(text, w).not.toContain(w)
    }
  })

  it('states no hadith number (none confirmed in two witnesses yet)', () => {
    for (const e of HIJRI_EVENTS) expect(e.citation, e.id).toBe('')
  })

  it("Quran leads resolve and say what they're cited for", () => {
    const skeleton = (s: string) => s.replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[ٱأإآ]/g, 'ا')
    const ayah = (surah: number, n: number) => {
      const file = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../data/surah-${surah}.json`), 'utf8'))
      return skeleton(file.ayahs.find((a: { number: number }) => a.number === n).textUthmani as string)
    }
    const leads = Object.fromEntries(HIJRI_EVENTS.filter((e) => e.quran).map((e) => [e.id, e.quran!]))
    expect(Object.keys(leads).sort()).toEqual(['last-ten-nights', 'ramadan'])
    expect(formatQuranLead(leads.ramadan)).toBe('Quran 2:183–185')
    expect(ayah(2, 183)).toContain('الصيام')
    expect(ayah(2, 185)).toContain('رمضان')
    expect(formatQuranLead(leads['last-ten-nights'])).toBe('Quran 97:1–5')
    expect(ayah(97, 1)).toContain('القدر')
  })
})

describe('events on a day (Umm al-Qura)', () => {
  it('Ramadan, the last ten nights and Eid al-Fitr 1448', () => {
    expect(ids(eventsOn('2027-02-08'))).toEqual(['ramadan']) // a Monday, but in Ramadan: no Monday mark
    expect(ids(eventsOn('2027-02-28'))).toEqual(['last-ten-nights', 'ramadan']) // 21 Ramadan
    expect(ids(eventsOn('2027-03-09'))).toEqual(['eid-al-fitr'])
    expect(ids(eventsOn('2027-03-10'))).toEqual(['six-shawwal'])
  })

  it('Dhul-Hijjah 1448: Arafah, Eid al-Adha, tashriq', () => {
    expect(ids(eventsOn('2027-05-15'))).toEqual(['arafah', 'dhul-hijjah-ten'])
    expect(ids(eventsOn('2027-05-16'))).toEqual(['dhul-hijjah-ten', 'eid-al-adha'])
    // 13 Dhu al-Hijjah: tashriq only, no white-day or Monday/Thursday mark
    const d13 = fromHijri(1448, 12, 13)
    expect(ids(eventsOn(d13))).toEqual(['tashriq'])
  })

  it('Tasu\'a and Ashura', () => {
    const ashura = fromHijri(1449, 1, 10)
    expect(eventsOn(ashura).map((e) => e.id)).toContain('ashura')
    expect(eventsOn(addDays(ashura, -1)).map((e) => e.id)).toContain('tasua')
  })

  it('white days and Mondays/Thursdays, outside the no-mark days', () => {
    expect(ids(eventsOnHijri({ year: 1448, month: 6, day: 13 }, 0))).toEqual(['white-days'])
    expect(ids(eventsOnHijri({ year: 1448, month: 6, day: 2 }, 4))).toEqual(['mon-thu'])
    expect(ids(eventsOnHijri({ year: 1448, month: 6, day: 14 }, 1))).toEqual(['mon-thu', 'white-days'])
    expect(eventsOnHijri({ year: 1448, month: 9, day: 13 }, 1).map((e) => e.id)).toEqual(['ramadan'])
    expect(eventsOnHijri({ year: 1448, month: 10, day: 1 }, 4).map((e) => e.id)).toEqual(['eid-al-fitr'])
  })

  it('no-mark days are Ramadan, both Eids and tashriq', () => {
    expect(noVoluntaryFastMark({ month: 9, day: 5 })).toBe(true)
    expect(noVoluntaryFastMark({ month: 10, day: 1 })).toBe(true)
    expect(noVoluntaryFastMark({ month: 10, day: 2 })).toBe(false)
    for (const day of [10, 11, 12, 13]) expect(noVoluntaryFastMark({ month: 12, day })).toBe(true)
    expect(noVoluntaryFastMark({ month: 12, day: 9 })).toBe(false)
    expect(noVoluntaryFastMark({ month: 12, day: 14 })).toBe(false)
  })
})

describe('occurrences in a month', () => {
  it('clips spans to the month length (Ramadan 1448 has 29 days)', () => {
    const occ = occurrencesInMonth({ year: 1448, month: 9 })
    const r = occ.find((o) => o.event.id === 'ramadan')!
    expect([r.first, r.last]).toEqual(['2027-02-08', '2027-03-08'])
    const ten = occ.find((o) => o.event.id === 'last-ten-nights')!
    expect([ten.first, ten.last]).toEqual(['2027-02-28', '2027-03-08'])
    // No white days in Ramadan; no weekly events in the list
    expect(occ.map((o) => o.event.id)).toEqual(['ramadan', 'last-ten-nights'])
  })

  it('white days in Dhul-Hijjah skip the 13th (tashriq)', () => {
    const occ = occurrencesInMonth({ year: 1448, month: 12 })
    const white = occ.find((o) => o.event.id === 'white-days')!
    expect([white.hijri.day, white.first, white.last]).toEqual([14, fromHijri(1448, 12, 14), fromHijri(1448, 12, 15)])
    expect(occ.map((o) => o.event.id)).toEqual(['dhul-hijjah-ten', 'arafah', 'eid-al-adha', 'tashriq', 'white-days'])
  })

  it('shift with the offset', () => {
    const base = occurrencesInMonth({ year: 1448, month: 10 })
    const shifted = occurrencesInMonth({ year: 1448, month: 10 }, -1)
    expect(base[0].event.id).toBe('eid-al-fitr')
    expect(shifted[0].first).toBe(addDays(base[0].first, 1))
  })

  it('every occurrence lies inside its month, under any offset and either calendar', () => {
    for (const tabular of [false, true]) {
      forceTabularForTests(tabular)
      for (const offset of [-2, 0, 2]) {
        for (let month = 1; month <= 12; month++) {
          const ref = { year: 1449, month }
          const { first, last } = monthBounds(ref, offset)
          for (const o of occurrencesInMonth(ref, offset)) {
            expect(o.first >= first && o.last <= last && o.first <= o.last).toBe(true)
            expect(toHijri(o.first, offset)).toEqual(o.hijri)
          }
        }
      }
    }
  })
})

describe('coming up', () => {
  it('from 13 November 2026: Ramadan first, each annual occasion once, in date order', () => {
    const up = upcomingOccasions('2026-11-13', 0, 20)
    expect(up[0].event.id).toBe('ramadan')
    expect(up[0].first).toBe('2027-02-08')
    expect(daysUntil('2026-11-13', up[0])).toBe(87)
    expect(new Set(up.map((o) => o.event.id)).size).toBe(up.length)
    expect(up).toHaveLength(10) // every annual event, nothing monthly or weekly
    for (let i = 1; i < up.length; i++) expect(up[i - 1].first <= up[i].first).toBe(true)
  })

  it('a running occasion counts, at zero days', () => {
    const up = upcomingOccasions('2027-02-20', 0, 3)
    expect(up[0].event.id).toBe('ramadan')
    expect(daysUntil('2027-02-20', up[0])).toBe(0)
    expect(up.map((o) => o.event.id)).toEqual(['ramadan', 'last-ten-nights', 'eid-al-fitr'])
  })

  it('the offset moves the dates', () => {
    expect(upcomingOccasions('2026-11-13', 1, 1)[0].first).toBe('2027-02-07')
  })

  it('works on the tabular fallback', () => {
    forceTabularForTests(true)
    const up = upcomingOccasions('2026-11-13', 0, 20)
    expect(up).toHaveLength(10)
    expect(up[0].first).toBe('2027-02-08')
  })
})
