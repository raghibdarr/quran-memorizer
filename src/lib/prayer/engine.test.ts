import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  computeDay,
  currentPrayer,
  currentWindow,
  effectiveHighLatRule,
  formatTime,
  formatUntil,
  isoInTz,
  nextPrayer,
  prayerRows,
  qiblaBearing,
} from './engine'
import { NAMED_METHODS } from './methods'
import { TIME_NAMES, type MethodId, type PrayerCalcSettings } from '@/types/prayer'

const ZERO = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
const settings = (method: MethodId, extra: Partial<PrayerCalcSettings> = {}): PrayerCalcSettings => ({
  method, madhab: 'standard', highLatRule: 'auto', offsets: ZERO, ...extra,
})

const CITIES = {
  makkah: { lat: 21.42, lng: 39.83, tz: 'Asia/Riyadh' },
  london: { lat: 51.51, lng: -0.13, tz: 'Europe/London' },
  newyork: { lat: 40.71, lng: -74.01, tz: 'America/New_York' },
  karachi: { lat: 24.86, lng: 67.01, tz: 'Asia/Karachi' },
  jakarta: { lat: -6.21, lng: 106.85, tz: 'Asia/Jakarta' },
  cairo: { lat: 30.04, lng: 31.24, tz: 'Africa/Cairo' },
  istanbul: { lat: 41.01, lng: 28.98, tz: 'Europe/Istanbul' },
  sydney: { lat: -33.87, lng: 151.21, tz: 'Australia/Sydney' },
}

// adhan 4.4.6 reference values for 15 March 2026, computed straight from the
// library (CalculationMethod.X(), HighLatitudeRule.recommended, AqrabYaum) and
// formatted in each city's zone: Fajr Sunrise Dhuhr Asr Maghrib Isha
const GOLDEN: Record<keyof typeof CITIES, Record<string, string>> = {
  makkah: { MuslimWorldLeague: '05:16 06:29 12:31 15:54 18:30 19:40', NorthAmerica: '05:29 06:29 12:31 15:54 18:30 19:31', Egyptian: '05:09 06:29 12:31 15:54 18:30 19:42', UmmAlQura: '05:14 06:29 12:30 15:54 18:30 20:00' },
  london: { MuslimWorldLeague: '04:31 06:15 12:10 15:21 18:05 19:49', NorthAmerica: '04:43 06:15 12:10 15:21 18:05 19:37', Egyptian: '04:31 06:15 12:10 15:21 18:05 19:49', UmmAlQura: '04:31 06:15 12:09 15:21 18:05 19:35' },
  newyork: { MuslimWorldLeague: '05:36 07:08 13:06 16:27 19:03 20:29', NorthAmerica: '05:53 07:08 13:06 16:27 19:03 20:18', Egyptian: '05:28 07:08 13:06 16:27 19:03 20:32', UmmAlQura: '05:34 07:08 13:05 16:27 19:03 20:33' },
  karachi: { MuslimWorldLeague: '05:26 06:41 12:42 16:06 18:41 19:52', NorthAmerica: '05:39 06:41 12:42 16:06 18:41 19:43', Egyptian: '05:19 06:41 12:42 16:06 18:41 19:54', UmmAlQura: '05:23 06:41 12:41 16:06 18:41 20:11' },
  jakarta: { MuslimWorldLeague: '04:48 05:57 12:03 15:09 18:06 19:11', NorthAmerica: '05:00 05:57 12:03 15:09 18:06 19:03', Egyptian: '04:42 05:57 12:03 15:09 18:06 19:13', UmmAlQura: '04:46 05:57 12:02 15:09 18:06 19:36' },
  cairo: { MuslimWorldLeague: '04:46 06:05 12:05 15:29 18:03 19:18', NorthAmerica: '05:00 06:05 12:05 15:29 18:03 19:09', Egyptian: '04:39 06:05 12:05 15:29 18:03 19:21', UmmAlQura: '04:43 06:05 12:04 15:29 18:03 19:33' },
  istanbul: { MuslimWorldLeague: '05:45 07:16 13:14 16:35 19:11 20:37', NorthAmerica: '06:01 07:16 13:14 16:35 19:11 20:26', Egyptian: '05:36 07:16 13:14 16:35 19:11 20:40', UmmAlQura: '05:42 07:16 13:13 16:35 19:11 20:41' },
  sydney: { MuslimWorldLeague: '05:30 06:54 13:05 16:34 19:14 20:33', NorthAmerica: '05:45 06:54 13:05 16:34 19:14 20:23', Egyptian: '05:23 06:54 13:05 16:34 19:14 20:35', UmmAlQura: '05:28 06:54 13:04 16:34 19:14 20:44' },
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

describe('computeDay: golden times (8 cities x 4 methods, adhan reference)', () => {
  for (const [city, place] of Object.entries(CITIES) as Array<[keyof typeof CITIES, (typeof CITIES)['london']]>) {
    for (const method of Object.keys(GOLDEN[city]) as MethodId[]) {
      it(`${city} / ${method}`, () => {
        const day = computeDay(place, '2026-03-15', settings(method))
        const expected = GOLDEN[city][method].split(' ')
        TIME_NAMES.forEach((name, i) => {
          const got = formatTime(day[name]!, place.tz)
          expect(Math.abs(minutesOf(got) - minutesOf(expected[i])), `${name} ${got} vs ${expected[i]}`).toBeLessThanOrEqual(1)
        })
      })
    }
  }
})

describe('computeDay: settings', () => {
  const london = CITIES.london
  it('applies per-prayer offsets last, in minutes', () => {
    const base = computeDay(london, '2026-03-15', settings('MuslimWorldLeague'))
    const moved = computeDay(london, '2026-03-15', settings('MuslimWorldLeague', { offsets: { ...ZERO, fajr: 5, isha: -3 } }))
    expect(moved.fajr! - base.fajr!).toBe(5 * 60_000)
    expect(moved.isha! - base.isha!).toBe(-3 * 60_000)
    expect(moved.dhuhr).toBe(base.dhuhr)
  })

  it('Hanafi Asr is later than the standard Asr', () => {
    const std = computeDay(london, '2026-03-15', settings('MuslimWorldLeague'))
    const han = computeDay(london, '2026-03-15', settings('MuslimWorldLeague', { madhab: 'hanafi' }))
    expect(han.asr! - std.asr!).toBeGreaterThan(30 * 60_000)
  })

  it('custom angles and an Isha interval', () => {
    const angles = computeDay(CITIES.cairo, '2026-03-15', settings('custom', { customAngles: { fajr: 19.5, isha: 17.5 } }))
    const egyptian = computeDay(CITIES.cairo, '2026-03-15', settings('Egyptian'))
    expect(Math.abs(angles.fajr! - egyptian.fajr!)).toBeLessThanOrEqual(60_000)
    const interval = computeDay(CITIES.cairo, '2026-03-15', settings('custom', { customAngles: { fajr: 18, isha: 0, ishaInterval: 90 } }))
    expect(interval.isha! - interval.maghrib!).toBe(90 * 60_000)
  })

  it('auto resolves to adhan’s recommendation; a chosen rule is kept', () => {
    expect(effectiveHighLatRule(CITIES.makkah, 'auto')).toBe('middleofthenight')
    expect(effectiveHighLatRule(CITIES.london, 'auto')).toBe('seventhofthenight')
    expect(effectiveHighLatRule(CITIES.london, 'twilightangle')).toBe('twilightangle')
  })

  it('a chosen rule leaves times that do not exist as null, never NaN', () => {
    const day = computeDay({ lat: 69.65, lng: 18.96, tz: 'Europe/Oslo' }, '2026-06-21', settings('MuslimWorldLeague', { highLatRule: 'middleofthenight' }))
    for (const name of TIME_NAMES) {
      const t = day[name]
      expect(t === null || Number.isFinite(t)).toBe(true)
    }
    expect(day.sunrise).toBeNull()
  })
})

const methodArb = fc.constantFrom(...(NAMED_METHODS as MethodId[]))
const isoArb = fc.date({ min: new Date(Date.UTC(2020, 0, 1)), max: new Date(Date.UTC(2035, 11, 31)), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10))

describe('computeDay: properties', () => {
  it('times are in order for |lat| < 48', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -47.9, max: 47.9, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        isoArb,
        methodArb,
        fc.constantFrom('standard' as const, 'hanafi' as const),
        (lat, lng, iso, method, madhab) => {
          const d = computeDay({ lat, lng, tz: 'UTC' }, iso, settings(method, { madhab }))
          const seq = TIME_NAMES.map((n) => d[n])
          for (const t of seq) expect(t).not.toBeNull()
          for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThan(seq[i - 1]!)
        },
      ),
      { numRuns: 400 },
    )
  })

  it('no NaN and no gaps up to |lat| 66 with the auto rule', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -66, max: 66, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        isoArb,
        methodArb,
        (lat, lng, iso, method) => {
          const d = computeDay({ lat, lng, tz: 'UTC' }, iso, settings(method))
          for (const n of TIME_NAMES) expect(Number.isFinite(d[n])).toBe(true)
        },
      ),
      { numRuns: 400 },
    )
  })
})

describe('daylight saving days', () => {
  const DAY = 864e5
  const cases = [
    { name: 'London spring', place: CITIES.london, before: '2026-03-28', after: '2026-03-29', shift: 60 },
    { name: 'London autumn', place: CITIES.london, before: '2026-10-24', after: '2026-10-25', shift: -60 },
    { name: 'New York spring', place: CITIES.newyork, before: '2026-03-07', after: '2026-03-08', shift: 60 },
    { name: 'New York autumn', place: CITIES.newyork, before: '2026-10-31', after: '2026-11-01', shift: -60 },
  ]
  for (const c of cases) {
    it(`${c.name}: instants stay continuous, the clock moves by an hour`, () => {
      const a = computeDay(c.place, c.before, settings('MuslimWorldLeague'))
      const b = computeDay(c.place, c.after, settings('MuslimWorldLeague'))
      // The sun doesn't care about clocks: Dhuhr moves by under 2 minutes a day
      expect(Math.abs(b.dhuhr! - a.dhuhr! - DAY)).toBeLessThan(2 * 60_000)
      const clock = minutesOf(formatTime(b.dhuhr!, c.place.tz)) - minutesOf(formatTime(a.dhuhr!, c.place.tz))
      expect(Math.abs(clock - c.shift)).toBeLessThanOrEqual(2)
      // Every time of the changeover day falls on that local day
      for (const n of TIME_NAMES) expect(isoInTz(b[n]!, c.place.tz)).toBe(c.after)
    })
  }
})

describe('the requested local day, wherever the date line is', () => {
  // adhan works from the UTC date. Where the civil date runs ahead of the sun's
  // (UTC+13/+14 at western longitudes) it used to answer with the next day.
  const PLACES = {
    tongatapu: { lat: -21.13, lng: -175.2, tz: 'Pacific/Tongatapu' },
    apia: { lat: -13.83, lng: -171.77, tz: 'Pacific/Apia' },
    kiritimati: { lat: 1.87, lng: -157.4, tz: 'Pacific/Kiritimati' },
    suva: { lat: -18.14, lng: 178.44, tz: 'Pacific/Fiji' },
    gisborne: { lat: -38.66, lng: 178.02, tz: 'Pacific/Auckland' },
    auckland: { lat: -36.85, lng: 174.76, tz: 'Pacific/Auckland' },
    honolulu: { lat: 21.3, lng: -157.86, tz: 'Pacific/Honolulu' },
    pagoPago: { lat: -14.28, lng: -170.7, tz: 'Pacific/Pago_Pago' },
    anchorage: { lat: 61.22, lng: -149.9, tz: 'America/Anchorage' },
    urumqi: { lat: 43.83, lng: 87.62, tz: 'Asia/Shanghai' },
    ...CITIES,
  }
  for (const [name, place] of Object.entries(PLACES)) {
    it(`${name}: Dhuhr, Asr and Maghrib fall on the day asked for, all year`, () => {
      const s = settings('MuslimWorldLeague')
      let prevDhuhr: number | null = null
      for (let i = 0; i < 366; i += 3) {
        const iso = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
        const d = computeDay(place, iso, s)
        for (const n of ['dhuhr', 'asr', 'maghrib'] as const) expect(isoInTz(d[n]!, place.tz), `${iso} ${n}`).toBe(iso)
        expect(isoInTz(d.fajr!, place.tz), `${iso} fajr`).toBe(iso)
        // Three days on, Dhuhr is three days later (give or take the sun and one DST hour)
        if (prevDhuhr !== null) expect(Math.abs(d.dhuhr! - prevDhuhr - 3 * 864e5)).toBeLessThanOrEqual(61 * 60_000)
        prevDhuhr = d.dhuhr!
      }
    })
  }

  it('Tonga: the next prayer and the rows belong to today', () => {
    const tonga = PLACES.tongatapu
    const s = settings('MuslimWorldLeague')
    const day = computeDay(tonga, '2026-05-14', s)
    expect(formatTime(day.dhuhr!, tonga.tz)).toMatch(/^12:3\d$/)
    expect(nextPrayer(tonga, s, day.dhuhr! - 60_000)).toEqual({ prayer: 'dhuhr', at: day.dhuhr, iso: '2026-05-14' })
    expect(currentPrayer(tonga, s, day.asr! + 60_000)).toMatchObject({ prayer: 'asr', iso: '2026-05-14' })
    expect(currentWindow(tonga, s, day.fajr! + 60_000)).toBe('morning')
  })

  it('the far south gets the same high-latitude care as the far north', () => {
    expect(effectiveHighLatRule({ lat: -54.8, lng: -68.3 }, 'auto')).toBe('seventhofthenight')
    expect(effectiveHighLatRule({ lat: -33.87, lng: 151.21 }, 'auto')).toBe('middleofthenight')
    const d = computeDay({ lat: -54.8, lng: -68.3, tz: 'America/Argentina/Ushuaia' }, '2026-12-21', settings('MuslimWorldLeague'))
    for (const n of TIME_NAMES) expect(Number.isFinite(d[n])).toBe(true)
  })

  it('an unknown zone name does not throw in computeDay', () => {
    const d = computeDay({ lat: 51.51, lng: -0.13, tz: 'Not/AZone' }, '2026-03-15', settings('MuslimWorldLeague'))
    expect(d.dhuhr).toBe(computeDay(CITIES.london, '2026-03-15', settings('MuslimWorldLeague')).dhuhr)
  })
})

describe('nextPrayer, currentPrayer, currentWindow, prayerRows', () => {
  const london = CITIES.london
  const s = settings('MuslimWorldLeague')
  const day = computeDay(london, '2026-03-15', s)
  const next = computeDay(london, '2026-03-16', s)

  it('next prayer skips sunrise and rolls to tomorrow’s Fajr after Isha', () => {
    expect(nextPrayer(london, s, day.fajr! - 1)).toEqual({ prayer: 'fajr', at: day.fajr, iso: '2026-03-15' })
    expect(nextPrayer(london, s, day.sunrise! + 1)?.prayer).toBe('dhuhr')
    expect(nextPrayer(london, s, day.isha! + 60_000)).toEqual({ prayer: 'fajr', at: next.fajr, iso: '2026-03-16' })
  })

  it('current prayer: Fajr until sunrise, nothing until Dhuhr, Isha past midnight', () => {
    expect(currentPrayer(london, s, day.fajr! + 1)?.prayer).toBe('fajr')
    expect(currentPrayer(london, s, day.sunrise! + 1)).toBeNull()
    const lateNight = next.fajr! - 30 * 60_000
    expect(currentPrayer(london, s, lateNight)).toMatchObject({ prayer: 'isha', iso: '2026-03-15', endMs: next.fajr })
  })

  it('adhkar windows: morning Fajr→sunrise, evening Asr→Maghrib', () => {
    expect(currentWindow(london, s, day.fajr! + 1)).toBe('morning')
    expect(currentWindow(london, s, day.dhuhr! + 1)).toBeNull()
    expect(currentWindow(london, s, day.asr! + 1)).toBe('evening')
    expect(currentWindow(london, s, day.maghrib! + 1)).toBeNull()
  })

  it('rows: six, each ending where the next begins, Isha at tomorrow’s Fajr', () => {
    const rows = prayerRows(london, '2026-03-15', s)
    expect(rows.map((r) => r.name)).toEqual(TIME_NAMES)
    for (let i = 0; i < 5; i++) expect(rows[i].endMs).toBe(rows[i + 1].startMs)
    expect(rows[5].endMs).toBe(next.fajr)
  })
})

describe('qibla, formatting', () => {
  it('qibla bearings', () => {
    expect(qiblaBearing(CITIES.london)).toBeCloseTo(118.99, 0)
    expect(qiblaBearing(CITIES.newyork)).toBeCloseTo(58.48, 0)
    expect(qiblaBearing(CITIES.jakarta)).toBeCloseTo(295.15, 0)
  })

  it('formats in the place’s zone, whatever the device zone', () => {
    const t = Date.UTC(2026, 2, 15, 12, 5)
    expect(formatTime(t, 'Europe/London')).toBe('12:05')
    expect(formatTime(t, 'Asia/Karachi')).toBe('17:05')
    expect(formatTime(t, 'America/New_York', { hour12: true })).toBe('8:05 AM')
    expect(isoInTz(Date.UTC(2026, 2, 15, 23, 30), 'Asia/Karachi')).toBe('2026-03-16')
  })

  it('countdowns', () => {
    expect(formatUntil(64 * 60_000, 0)).toBe('in 1 h 4 min')
    expect(formatUntil(12 * 60_000 - 5, 0)).toBe('in 12 min')
    expect(formatUntil(120 * 60_000, 0)).toBe('in 2 h')
    expect(formatUntil(0, 10)).toBe('now')
  })
})
