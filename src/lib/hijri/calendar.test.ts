import { afterEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { forceTabularForTests, toHijri } from './convert'
import {
  addDays,
  addHijriMonths,
  daysFrom,
  formatCivil,
  formatHijriMonth,
  gregorianSpan,
  hijriMonthOf,
  monthBounds,
  monthGrid,
  todayIso,
  weekdayHeaders,
  weekdayOf,
} from './calendar'

// Civil dates only: these hold under every TZ in the CI matrix
// (UTC, America/New_York, Pacific/Auckland, Asia/Karachi).

afterEach(() => forceTabularForTests(false))

const isoArb = fc
  .integer({ min: Math.round(Date.UTC(1990, 0, 1) / 864e5), max: Math.round(Date.UTC(2060, 11, 31) / 864e5) })
  .map((n) => new Date(n * 864e5).toISOString().slice(0, 10))

describe('civil-date helpers', () => {
  it('weekdays and day arithmetic', () => {
    expect(weekdayOf('2027-02-08')).toBe(1) // a Monday
    expect(weekdayOf('2026-11-13')).toBe(5) // a Friday
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(daysFrom('2026-11-13', '2027-02-08')).toBe(87)
    // Across a DST change in every zone
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('formats civil dates', () => {
    expect(formatCivil('2027-02-08')).toBe('Monday 8 February 2027')
    expect(formatCivil('2027-02-08', { weekday: false, year: false })).toBe('8 February')
    expect(gregorianSpan('2026-11-11', '2026-12-10')).toBe('November – December 2026')
    expect(gregorianSpan('2026-12-10', '2027-01-08')).toBe('December 2026 – January 2027')
    expect(gregorianSpan('2027-03-01', '2027-03-29')).toBe('March 2027')
  })

  it("today follows the place's zone, else the device", () => {
    const t = Date.UTC(2026, 10, 13, 12, 30) // 12:30 UTC
    expect(todayIso(t, 'Pacific/Kiritimati')).toBe('2026-11-14') // UTC+14
    expect(todayIso(t, 'Pacific/Pago_Pago')).toBe('2026-11-13') // UTC-11
    expect(todayIso(t, 'Not/AZone')).toBe(todayIso(t))
    const d = new Date(t)
    expect(todayIso(t)).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  })
})

describe('month navigation', () => {
  it('wraps the year both ways', () => {
    expect(addHijriMonths({ year: 1448, month: 12 }, 1)).toEqual({ year: 1449, month: 1 })
    expect(addHijriMonths({ year: 1448, month: 1 }, -1)).toEqual({ year: 1447, month: 12 })
    expect(addHijriMonths({ year: 1448, month: 9 }, 25)).toEqual({ year: 1450, month: 10 })
    expect(addHijriMonths({ year: 1448, month: 9 }, -21)).toEqual({ year: 1446, month: 12 })
  })

  it('n forward then n back is the same month', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1300, max: 1500 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: -40, max: 40 }), (year, month, n) => {
        expect(addHijriMonths(addHijriMonths({ year, month }, n), -n)).toEqual({ year, month })
      }),
    )
  })

  it('names months', () => {
    expect(formatHijriMonth({ year: 1448, month: 9 })).toBe('Ramadan 1448')
    expect(formatHijriMonth(hijriMonthOf('2026-11-13'))).toBe('Jumada al-Akhirah 1448')
  })
})

describe('month grid (Umm al-Qura)', () => {
  it('Ramadan 1448: expected 8 February to 8 March 2027, Monday first', () => {
    const g = monthGrid({ year: 1448, month: 9 }, { today: '2027-02-10' })
    expect(g.length).toBe(29)
    expect(g.days[0].iso).toBe('2027-02-08')
    expect(g.days[g.length - 1].iso).toBe('2027-03-08')
    expect(g.gregorianSpan).toBe('February – March 2027')
    // Sunday-first: a blank Sunday, then day 1 on Monday
    expect(g.weeks[0][0]).toBeNull()
    expect(g.weeks[0][1]?.hijri.day).toBe(1)
    expect(g.weeks.every((w) => w.length === 7)).toBe(true)
    expect(g.days.filter((d) => d.isToday).map((d) => d.hijri.day)).toEqual([3])
  })

  it('week start moves the lead blanks', () => {
    const ref = { year: 1448, month: 9 }
    expect(monthGrid(ref, { weekStart: 1 }).weeks[0][0]?.hijri.day).toBe(1)
    expect(monthGrid(ref, { weekStart: 6 }).weeks[0].slice(0, 2)).toEqual([null, null])
    expect(weekdayHeaders(1)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it('every cell agrees with convert.ts, and days run on without gaps', () => {
    fc.assert(
      fc.property(isoArb, fc.integer({ min: -2, max: 2 }), (iso, offset) => {
        const g = monthGrid(hijriMonthOf(iso, offset), { offset, today: iso })
        expect(g.days.filter((d) => d.isToday)).toHaveLength(1)
        g.days.forEach((d, i) => {
          expect(toHijri(d.iso, offset)).toEqual(d.hijri)
          expect(d.weekday).toBe(weekdayOf(d.iso))
          if (i) expect(daysFrom(g.days[i - 1].iso, d.iso)).toBe(1)
        })
        expect([29, 30]).toContain(g.length)
        // The next month starts the day after this one ends
        const next = monthBounds(addHijriMonths(g, 1), offset)
        expect(daysFrom(g.days[g.length - 1].iso, next.first)).toBe(1)
      }),
      { numRuns: 60 },
    )
  })
})

describe('the Hijri offset shifts every date', () => {
  it('+1 brings 1 Ramadan a day earlier; -1 a day later', () => {
    expect(monthBounds({ year: 1448, month: 9 }, 1).first).toBe('2027-02-07')
    expect(monthBounds({ year: 1448, month: 9 }, -1).first).toBe('2027-02-09')
    expect(monthBounds({ year: 1448, month: 9 }, 2).first).toBe('2027-02-06')
  })

  it('the grid moves as a whole, length unchanged', () => {
    for (const offset of [-2, -1, 1, 2]) {
      const base = monthGrid({ year: 1448, month: 9 })
      const g = monthGrid({ year: 1448, month: 9 }, { offset })
      expect(g.length).toBe(base.length)
      expect(daysFrom(g.days[0].iso, base.days[0].iso)).toBe(offset)
    }
  })

  it('the month of today follows the offset', () => {
    // 7 February 2027 is the last day of Sha'ban; +1 makes it 1 Ramadan
    expect(hijriMonthOf('2027-02-07')).toEqual({ year: 1448, month: 8 })
    expect(hijriMonthOf('2027-02-07', 1)).toEqual({ year: 1448, month: 9 })
  })
})

describe('without Intl islamic-umalqura (tabular fallback)', () => {
  it('still builds whole, consistent months', () => {
    forceTabularForTests(true)
    const g = monthGrid({ year: 1448, month: 9 }, { today: '2027-02-08' })
    expect(g.days[0].iso).toBe('2027-02-08')
    expect(g.length).toBe(30) // the tabular calendar's 30 days, within a day of Umm al-Qura
    expect(g.days[0].isToday).toBe(true)
    g.days.forEach((d) => expect(toHijri(d.iso)).toEqual(d.hijri))
    expect(formatHijriMonth(hijriMonthOf('2026-11-13'))).toBe('Jumada al-Akhirah 1448')
  })

  it('offsets still shift the tabular grid', () => {
    forceTabularForTests(true)
    expect(monthBounds({ year: 1448, month: 9 }, 1).first).toBe('2027-02-07')
    fc.assert(
      fc.property(isoArb, fc.integer({ min: -2, max: 2 }), (iso, offset) => {
        const g = monthGrid(hijriMonthOf(iso, offset), { offset, today: iso })
        expect(g.days.filter((d) => d.isToday)).toHaveLength(1)
      }),
      { numRuns: 40 },
    )
  })
})

describe('with no Intl at all', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('today falls back to the device calendar, and months come from the tabular calendar', () => {
    const t = Date.UTC(2026, 10, 13, 12, 0)
    const device = todayIso(t)
    vi.stubGlobal('Intl', undefined)
    forceTabularForTests(false) // re-run the feature test without Intl
    expect(todayIso(t, 'Europe/London')).toBe(device)
    const g = monthGrid({ year: 1448, month: 9 }, { offset: -1, today: '2027-02-09' })
    expect(g.days[0].iso).toBe('2027-02-09')
    expect(g.days[0].isToday).toBe(true)
    expect(g.weeks.every((w) => w.length === 7)).toBe(true)
  })
})

describe('today in the place zone on clock-change days', () => {
  it('keeps the civil day either side of the change', () => {
    // London springs forward at 01:00 UTC on 29 March 2026
    expect(todayIso(Date.UTC(2026, 2, 28, 23, 59), 'Europe/London')).toBe('2026-03-28')
    expect(todayIso(Date.UTC(2026, 2, 29, 0, 0), 'Europe/London')).toBe('2026-03-29')
    expect(todayIso(Date.UTC(2026, 2, 29, 22, 59), 'Europe/London')).toBe('2026-03-29')
    expect(todayIso(Date.UTC(2026, 2, 29, 23, 0), 'Europe/London')).toBe('2026-03-30')
    // New York falls back on 1 November 2026: midnight is 04:00 UTC before, 05:00 UTC after
    expect(todayIso(Date.UTC(2026, 10, 1, 3, 59), 'America/New_York')).toBe('2026-10-31')
    expect(todayIso(Date.UTC(2026, 10, 2, 4, 59), 'America/New_York')).toBe('2026-11-01')
    expect(todayIso(Date.UTC(2026, 10, 2, 5, 0), 'America/New_York')).toBe('2026-11-02')
  })
})
