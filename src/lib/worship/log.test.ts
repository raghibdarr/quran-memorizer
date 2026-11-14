import { describe, expect, it, beforeEach } from 'vitest'
import fc from 'fast-check'
import { prayerRows, isoInTz } from '@/lib/prayer/engine'
import { addDaysIso } from '@/lib/dates'
import { PRAYER_NAMES, type PrayerCalcSettings, type PrayerName } from '@/types/prayer'
import { useWorshipStore, type Pause, type PrayerMark } from '@/stores/worship-store'
import {
  clearMark,
  compact,
  dayTally,
  inferMark,
  isPaused,
  makeUpOwed,
  missedEntries,
  openPause,
  rangeTally,
  resumeFor,
  setMark,
  type PrayerLog,
} from './log'

// Instants are built with Date.UTC and days with the place's zone, so this file
// passes under every TZ in the CI matrix (spec 3.7)

const MWL: PrayerCalcSettings = {
  method: 'MuslimWorldLeague',
  madhab: 'standard',
  highLatRule: 'auto',
  offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
}
const MIN = 60_000

// ---------- arbitraries ----------

const isoArb = fc
  .date({ min: new Date(Date.UTC(2024, 0, 1)), max: new Date(Date.UTC(2027, 11, 31)), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10))
const prayerArb = fc.constantFrom<PrayerName>(...PRAYER_NAMES)
const markArb = fc.constantFrom<PrayerMark>('ontime', 'late', 'missed')
const entryArb = fc.record({ s: markArb, at: fc.integer({ min: 0, max: 2_000_000_000_000 }) })
const dayArb = fc
  .dictionary(prayerArb, entryArb, { minKeys: 1, maxKeys: 5 })
  .map((d) => d as PrayerLog[string])
const logArb: fc.Arbitrary<PrayerLog> = fc.dictionary(isoArb, dayArb, { maxKeys: 40 })

describe('inferMark', () => {
  it('is inert before the time begins, on time inside it, late after it', () => {
    expect(inferMark(999, 1000, 2000)).toBeNull()
    expect(inferMark(1000, 1000, 2000)).toBe('ontime')
    expect(inferMark(1999, 1000, 2000)).toBe('ontime')
    expect(inferMark(2000, 1000, 2000)).toBe('late')
    expect(inferMark(9e12, 1000, 2000)).toBe('late')
  })

  it('treats a missing end (high latitude) as on time', () => {
    expect(inferMark(5000, 1000, null)).toBe('ontime')
  })

  // Isha's time runs past midnight to the next Fajr: a tick at 00:30 is still on time
  const PLACES = [
    { lat: 51.51, lng: -0.13, tz: 'Europe/London' },
    { lat: 35.68, lng: 139.69, tz: 'Asia/Tokyo' },
    { lat: 34.05, lng: -118.24, tz: 'America/Los_Angeles' },
    { lat: -33.87, lng: 151.21, tz: 'Australia/Sydney' },
  ]
  for (const place of PLACES) {
    for (const iso of ['2026-01-15', '2026-03-29', '2026-07-01', '2026-10-25', '2026-12-31']) {
      it(`Isha across midnight in ${place.tz} on ${iso}`, () => {
        const rows = prayerRows(place, iso, MWL)
        const isha = rows.find((r) => r.name === 'isha')!
        expect(isha.startMs).not.toBeNull()
        expect(isha.endMs).not.toBeNull()
        const start = isha.startMs!
        const end = isha.endMs!
        // The next day's Fajr, on the next local day
        expect(isoInTz(end, place.tz)).toBe(addDaysIso(iso, 1))
        // Local midnight after Isha: the first instant whose local day is iso + 1
        let midnight = start
        while (isoInTz(midnight, place.tz) === iso) midnight += MIN
        expect(midnight).toBeLessThan(end)
        expect(inferMark(midnight + 30 * MIN, start, end)).toBe('ontime')
        expect(inferMark(end - 1, start, end)).toBe('ontime')
        expect(inferMark(end, start, end)).toBe('late')
        expect(inferMark(start - 1, start, end)).toBeNull()
      })
    }
  }

  it('ends Fajr at sunrise, not at Dhuhr', () => {
    const place = { lat: 51.51, lng: -0.13, tz: 'Europe/London' }
    const rows = prayerRows(place, '2026-06-01', MWL)
    const fajr = rows.find((r) => r.name === 'fajr')!
    const sunrise = rows.find((r) => r.name === 'sunrise')!
    expect(fajr.endMs).toBe(sunrise.startMs)
    expect(inferMark(sunrise.startMs! + MIN, fajr.startMs!, fajr.endMs!)).toBe('late')
  })
})

describe('setMark / clearMark', () => {
  it('property: clearing a newly marked prayer restores the prior log exactly', () => {
    fc.assert(
      fc.property(logArb, isoArb, prayerArb, markArb, fc.integer(), (log, iso, prayer, s, at) => {
        fc.pre(!log[iso]?.[prayer])
        const before = structuredClone(log)
        const after = clearMark(setMark(log, iso, prayer, s, at), iso, prayer)
        expect(after).toEqual(before)
        expect(log).toEqual(before) // inputs never mutated
      }),
    )
  })

  it('property: re-marking replaces, and clearing a cleared slot changes nothing', () => {
    fc.assert(
      fc.property(logArb, isoArb, prayerArb, markArb, markArb, (log, iso, prayer, a, b) => {
        const once = setMark(setMark(log, iso, prayer, a, 1), iso, prayer, b, 2)
        expect(once[iso][prayer]).toEqual({ s: b, at: 2 })
        const cleared = clearMark(once, iso, prayer)
        expect(clearMark(cleared, iso, prayer)).toEqual(cleared)
      }),
    )
  })

  describe('the store agrees with the pure functions', () => {
    beforeEach(() => useWorshipStore.setState({ prayers: {} }))

    it('property: store mark then clear restores the prior log', () => {
      fc.assert(
        fc.property(logArb, isoArb, prayerArb, markArb, (log, iso, prayer, s) => {
          fc.pre(!log[iso]?.[prayer])
          useWorshipStore.setState({ prayers: structuredClone(log) })
          const { markPrayer, clearPrayer } = useWorshipStore.getState()
          markPrayer(iso, prayer, s, 123)
          expect(useWorshipStore.getState().prayers).toEqual(setMark(log, iso, prayer, s, 123))
          clearPrayer(iso, prayer)
          expect(useWorshipStore.getState().prayers).toEqual(log)
        }),
        { numRuns: 60 },
      )
    })
  })
})

describe('pauses', () => {
  const pauses: Pause[] = [
    { id: 'a', from: '2026-03-05', to: '2026-03-07' },
    { id: 'b', from: '2026-03-20' },
  ]

  it('covers from..to inclusive, and an open pause from its start on', () => {
    expect(isPaused('2026-03-04', pauses)).toBe(false)
    expect(isPaused('2026-03-05', pauses)).toBe(true)
    expect(isPaused('2026-03-07', pauses)).toBe(true)
    expect(isPaused('2026-03-08', pauses)).toBe(false)
    expect(isPaused('2026-03-19', pauses)).toBe(false)
    expect(isPaused('2026-03-20', pauses)).toBe(true)
    expect(isPaused('2030-01-01', pauses)).toBe(true)
    expect(openPause(pauses)?.id).toBe('b')
  })

  it('resuming ends the pause yesterday, or removes one that began today', () => {
    expect(resumeFor({ id: 'x', from: '2026-03-01' }, '2026-03-10')).toEqual({ remove: false, to: '2026-03-09' })
    expect(resumeFor({ id: 'x', from: '2026-03-09' }, '2026-03-10')).toEqual({ remove: false, to: '2026-03-09' })
    expect(resumeFor({ id: 'x', from: '2026-03-10' }, '2026-03-10')).toEqual({ remove: true })
  })

  it('leaves paused days out of the range counts and the make-up count', () => {
    let log: PrayerLog = {}
    log = setMark(log, '2026-03-04', 'fajr', 'missed', 1)
    log = setMark(log, '2026-03-06', 'fajr', 'missed', 1)
    log = setMark(log, '2026-03-06', 'dhuhr', 'ontime', 1)
    log = setMark(log, '2026-03-08', 'asr', 'late', 1)
    const t = rangeTally(log, pauses, '2026-03-01', '2026-03-10')
    expect(t).toEqual({ ontime: 0, late: 1, missed: 1, prayed: 1, days: 7 })
    expect(makeUpOwed(log, pauses, 0)).toBe(1)
    expect(makeUpOwed(log, [], 0)).toBe(2)
  })
})

describe('make-up count', () => {
  it('is missed marks less made-up ones, never below zero', () => {
    let log: PrayerLog = {}
    log = setMark(log, '2026-01-01', 'fajr', 'missed', 1)
    log = setMark(log, '2026-01-02', 'isha', 'missed', 1)
    log = setMark(log, '2026-01-02', 'asr', 'ontime', 1)
    expect(makeUpOwed(log, [], 0)).toBe(2)
    expect(makeUpOwed(log, [], 1)).toBe(1)
    expect(makeUpOwed(log, [], 5)).toBe(0)
    expect(missedEntries(log, [])).toEqual([
      { iso: '2026-01-02', prayer: 'isha' },
      { iso: '2026-01-01', prayer: 'fajr' },
    ])
  })

  it('never counts an empty slot as missed', () => {
    expect(makeUpOwed({}, [], 0)).toBe(0)
    expect(dayTally({ fajr: { s: 'ontime', at: 1 } })).toEqual({ ontime: 1, late: 0, missed: 0, prayed: 1 })
  })

  it('property: is monotone in the made-up count', () => {
    fc.assert(
      fc.property(logArb, fc.nat(300), (log, n) => {
        expect(makeUpOwed(log, [], n + 1)).toBeLessThanOrEqual(makeUpOwed(log, [], n))
        expect(makeUpOwed(log, [], n)).toBeGreaterThanOrEqual(0)
      }),
    )
  })
})

describe('compact', () => {
  const pausesArb: fc.Arbitrary<Pause[]> = fc.array(
    fc
      .tuple(isoArb, fc.integer({ min: 0, max: 40 }), fc.boolean(), fc.nat())
      .map(([from, len, open, n]): Pause => (open ? { id: `p${n}`, from } : { id: `p${n}`, from, to: addDaysIso(from, len) })),
    { maxLength: 3 },
  )

  it('changes nothing while the log is under two years old', () => {
    const log = setMark({}, '2025-01-10', 'fajr', 'ontime', 1)
    const out = compact(log, [], '2026-06-01')
    expect(out.prayers).toBe(log)
    expect(out.archive).toEqual({})
  })

  it('folds whole months older than two years into counts', () => {
    let log: PrayerLog = {}
    log = setMark(log, '2023-01-10', 'fajr', 'ontime', 1)
    log = setMark(log, '2023-01-11', 'fajr', 'missed', 1)
    log = setMark(log, '2023-02-03', 'isha', 'late', 1)
    log = setMark(log, '2024-06-01', 'asr', 'ontime', 1) // the cutoff month: kept whole
    log = setMark(log, '2026-06-01', 'asr', 'ontime', 1)
    const out = compact(log, [], '2026-06-15') // cutoff day 2024-06-15
    expect(Object.keys(out.prayers).sort()).toEqual(['2024-06-01', '2026-06-01'])
    expect(out.archive).toEqual({
      '2023-01': { ontime: 1, late: 0, missed: 1 },
      '2023-02': { ontime: 0, late: 1, missed: 0 },
    })
    // Folded misses still count towards make-ups
    expect(makeUpOwed(out.prayers, [], 0, out.archive)).toBe(1)
  })

  it('property: idempotent, and counts outside pauses are conserved', () => {
    fc.assert(
      fc.property(logArb, pausesArb, isoArb, (log, pauses, today) => {
        const once = compact(log, pauses, today)
        const twice = compact(once.prayers, pauses, today, once.archive)
        expect(twice).toEqual(once)
        const sum = (c: typeof once) => {
          const t = { ontime: 0, late: 0, missed: 0 }
          for (const [iso, day] of Object.entries(c.prayers)) {
            if (isPaused(iso, pauses)) continue
            const d = dayTally(day)
            t.ontime += d.ontime
            t.late += d.late
            t.missed += d.missed
          }
          for (const m of Object.values(c.archive)) {
            t.ontime += m.ontime
            t.late += m.late
            t.missed += m.missed
          }
          return t
        }
        expect(sum(once)).toEqual(sum({ prayers: log, archive: {} }))
        expect(makeUpOwed(once.prayers, pauses, 0, once.archive)).toBe(makeUpOwed(log, pauses, 0))
      }),
    )
  })
})
