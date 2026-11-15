import { afterEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  forceTabularForTests,
  formatHijri,
  fromHijri,
  hijriEngine,
  hijriMonthLength,
  isRamadan,
  tabularFromHijri,
  tabularToHijri,
  toHijri,
} from './convert'

// Umm al-Qura start dates (Saudi official calendar)
const UMALQURA_GOLDEN: Array<[string, number, number, number]> = [
  ['2023-03-23', 1444, 9, 1],
  ['2023-04-21', 1444, 10, 1],
  ['2024-03-11', 1445, 9, 1],
  ['2024-07-07', 1446, 1, 1],
  ['2025-03-01', 1446, 9, 1],
  ['2026-02-18', 1447, 9, 1],
  ['2027-02-08', 1448, 9, 1],
]

const isoArb = fc.integer({ min: Math.round(Date.UTC(1950, 0, 1) / 864e5), max: Math.round(Date.UTC(2070, 11, 31) / 864e5) })
  .map((n) => new Date(n * 864e5).toISOString().slice(0, 10))

afterEach(() => forceTabularForTests(false))

describe('Umm al-Qura through Intl (this Node has full ICU)', () => {
  it('is detected', () => {
    expect(hijriEngine()).toBe('umalqura')
  })

  it('golden dates both ways', () => {
    for (const [iso, y, m, d] of UMALQURA_GOLDEN) {
      expect(toHijri(iso), iso).toEqual({ year: y, month: m, day: d })
      expect(fromHijri(y, m, d), iso).toBe(iso)
    }
  })

  it('Ramadan 1448 is expected from 8 February 2027', () => {
    expect(isRamadan('2027-02-07')).toBe(false)
    expect(isRamadan('2027-02-08')).toBe(true)
    expect(formatHijri(toHijri('2027-02-08'))).toBe('1 Ramadan 1448')
  })

  it('the offset shifts the day the user sees', () => {
    expect(toHijri('2027-02-07', 1)).toEqual({ year: 1448, month: 9, day: 1 })
    expect(toHijri('2027-02-08', -1)).toEqual({ year: 1448, month: 8, day: hijriMonthLength(1448, 8) })
    expect(fromHijri(1448, 9, 1, 1)).toBe('2027-02-07')
    expect(isRamadan('2027-02-07', 1)).toBe(true)
  })

  it('accepts a Date by its local calendar fields', () => {
    expect(toHijri(new Date(2027, 1, 8, 23, 59))).toEqual({ year: 1448, month: 9, day: 1 })
    expect(toHijri(new Date(2027, 1, 8, 0, 1))).toEqual({ year: 1448, month: 9, day: 1 })
  })

  it('round-trips any day, any offset', () => {
    fc.assert(fc.property(isoArb, fc.integer({ min: -2, max: 2 }), (iso, off) => {
      const h = toHijri(iso, off)
      expect(fromHijri(h.year, h.month, h.day, off)).toBe(iso)
    }), { numRuns: 300 })
  })

  it('months are 29 or 30 days', () => {
    for (let y = 1440; y <= 1452; y++) {
      for (let m = 1; m <= 12; m++) expect([29, 30]).toContain(hijriMonthLength(y, m))
    }
  })

  it('a day the month lacks throws', () => {
    const short = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((m) => hijriMonthLength(1448, m) === 29)!
    expect(() => fromHijri(1448, short, 30)).toThrow(RangeError)
  })
})

describe('tabular fallback', () => {
  it('is used when Intl is unavailable', () => {
    forceTabularForTests(true)
    expect(hijriEngine()).toBe('tabular')
    expect(toHijri('2027-02-08')).toEqual(tabularToHijri('2027-02-08'))
  })

  it('known arithmetic anchors', () => {
    // The civil epoch: 1 Muharram 1 AH = 16 July 622 Julian = 19 July 622 proleptic Gregorian
    expect(tabularFromHijri(1, 1, 1)).toBe('0622-07-19')
    expect(tabularToHijri('0622-07-19')).toEqual({ year: 1, month: 1, day: 1 })
  })

  it('round-trips and stays within 2 days of Umm al-Qura', () => {
    fc.assert(fc.property(isoArb, (iso) => {
      const t = tabularToHijri(iso)
      expect(tabularFromHijri(t.year, t.month, t.day)).toBe(iso)
      const u = toHijri(iso) // Intl
      const tDay = Date.parse(tabularFromHijri(u.year, u.month, u.day))
      expect(Math.abs(tDay - Date.parse(iso)) / 864e5).toBeLessThanOrEqual(2)
    }), { numRuns: 300 })
  })

  it('years are 354 or 355 days; leap years follow the 30-year cycle', () => {
    const leaps = new Set([2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29])
    for (let y = 1441; y <= 1470; y++) {
      const len = (Date.parse(tabularFromHijri(y + 1, 1, 1)) - Date.parse(tabularFromHijri(y, 1, 1))) / 864e5
      expect(len).toBe(leaps.has(y % 30) ? 355 : 354)
    }
  })

  it('round-trips through the public API with the fallback forced', () => {
    forceTabularForTests(true)
    fc.assert(fc.property(isoArb, fc.integer({ min: -2, max: 2 }), (iso, off) => {
      const h = toHijri(iso, off)
      expect(fromHijri(h.year, h.month, h.day, off)).toBe(iso)
    }), { numRuns: 200 })
  })
})

describe('civil years 0 to 99', () => {
  it('reads year 1 as year 1, not 1901', () => {
    const h = toHijri('0001-01-01', 0)
    expect(h.year).toBeLessThan(0)
    expect(toHijri('0700-01-01', 0).year).toBeGreaterThan(70)
  })
})
