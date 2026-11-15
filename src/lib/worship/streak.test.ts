import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { addDaysIso } from '@/lib/dates'
import { PRAYER_NAMES } from '@/types/prayer'
import type { Pause } from '@/stores/worship-store'
import { currentRun, isWholeDay, longestRun } from './streak'
import type { DayLog, PrayerLog } from './log'

const WHOLE: DayLog = Object.fromEntries(PRAYER_NAMES.map((p, i) => [p, { s: i % 2 ? 'late' : 'ontime', at: 1 }]))
const PART: DayLog = { fajr: { s: 'ontime', at: 1 }, dhuhr: { s: 'missed', at: 1 } }

const START = '2026-02-20' // spans the end of February and a month change

/** A day in a generated history */
interface Day {
  kind: 'whole' | 'part' | 'empty'
  paused: boolean
}

/** Builds the log and the pauses (contiguous paused days become one pause; the last may stay open) */
function build(days: Day[], openLast: boolean): { log: PrayerLog; pauses: Pause[]; today: string } {
  const log: PrayerLog = {}
  const pauses: Pause[] = []
  let current: Pause | null = null
  days.forEach((d, i) => {
    const iso = addDaysIso(START, i)
    if (d.kind === 'whole') log[iso] = WHOLE
    else if (d.kind === 'part') log[iso] = PART
    if (d.paused) {
      if (!current) {
        current = { id: `p${i}`, from: iso, to: iso }
        pauses.push(current)
      } else current.to = iso
    } else current = null
  })
  const last = pauses[pauses.length - 1]
  const today = addDaysIso(START, days.length - 1)
  if (openLast && last && last.to === today) delete last.to
  return { log, pauses, today }
}

/** The reference: the same history with the paused days simply removed */
function refCurrent(days: Day[]): number {
  const kept = days.filter((d) => !d.paused)
  // An unfinished today is in progress, not a gap
  const lastIsToday = !days[days.length - 1].paused
  if (lastIsToday && kept.length && kept[kept.length - 1].kind !== 'whole') kept.pop()
  let run = 0
  for (let i = kept.length - 1; i >= 0 && kept[i].kind === 'whole'; i--) run++
  return run
}

function refLongest(days: Day[]): number {
  let best = 0
  let run = 0
  for (const d of days.filter((x) => !x.paused)) {
    run = d.kind === 'whole' ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

const dayArb: fc.Arbitrary<Day> = fc.record({
  kind: fc.constantFrom<Day['kind']>('whole', 'whole', 'part', 'empty'),
  paused: fc.boolean(),
})
const historyArb = fc.array(dayArb, { minLength: 1, maxLength: 60 })

describe('isWholeDay', () => {
  it('needs all five prayed, on time or late', () => {
    expect(isWholeDay(WHOLE)).toBe(true)
    expect(isWholeDay(PART)).toBe(false)
    expect(isWholeDay(undefined)).toBe(false)
    expect(isWholeDay({ ...WHOLE, isha: { s: 'missed', at: 1 } })).toBe(false)
  })
})

describe('runs', () => {
  it('counts whole days back from today', () => {
    const log: PrayerLog = { '2026-03-01': WHOLE, '2026-03-02': WHOLE, '2026-03-03': WHOLE }
    expect(currentRun(log, [], '2026-03-03')).toBe(3)
    expect(longestRun(log, [], '2026-03-03')).toBe(3)
  })

  it('treats an unfinished today as in progress', () => {
    const log: PrayerLog = { '2026-03-01': WHOLE, '2026-03-02': WHOLE, '2026-03-03': PART }
    expect(currentRun(log, [], '2026-03-03')).toBe(2)
    expect(currentRun(log, [], '2026-03-04')).toBe(0)
  })

  // Between midnight and Fajr the screen counts from the prayer day (the day
  // before), whose Isha is still current: it is in progress, not a gap
  it('counted from the prayer day, the run holds across midnight until Isha is logged', () => {
    const noIsha: DayLog = { ...WHOLE }
    delete noIsha.isha
    const log: PrayerLog = { '2026-03-01': WHOLE, '2026-03-02': WHOLE, '2026-03-03': noIsha }
    expect(currentRun(log, [], '2026-03-03')).toBe(2)
    expect(currentRun({ ...log, '2026-03-03': WHOLE }, [], '2026-03-03')).toBe(3)
  })

  it('is zero for an empty log', () => {
    expect(currentRun({}, [], '2026-03-03')).toBe(0)
    expect(longestRun({}, [], '2026-03-03')).toBe(0)
  })

  it('a pause over an unfinished day does not break the run', () => {
    const log: PrayerLog = { '2026-03-01': WHOLE, '2026-03-02': PART, '2026-03-03': WHOLE }
    expect(currentRun(log, [], '2026-03-03')).toBe(1)
    expect(currentRun(log, [{ id: 'a', from: '2026-03-02', to: '2026-03-02' }], '2026-03-03')).toBe(2)
  })

  it('a pause over whole days does not lengthen the run', () => {
    const log: PrayerLog = { '2026-03-01': WHOLE, '2026-03-02': WHOLE, '2026-03-03': WHOLE }
    expect(currentRun(log, [{ id: 'a', from: '2026-03-02', to: '2026-03-02' }], '2026-03-03')).toBe(2)
    expect(currentRun(log, [{ id: 'a', from: '2026-03-01' }], '2026-03-03')).toBe(0)
  })

  it('property: a pause never breaks or extends the current run', () => {
    fc.assert(
      fc.property(historyArb, fc.boolean(), (days, openLast) => {
        const { log, pauses, today } = build(days, openLast)
        expect(currentRun(log, pauses, today)).toBe(refCurrent(days))
      }),
      { numRuns: 400 },
    )
  })

  it('property: a pause never breaks or extends the longest run', () => {
    fc.assert(
      fc.property(historyArb, fc.boolean(), (days, openLast) => {
        const { log, pauses, today } = build(days, openLast)
        expect(longestRun(log, pauses, today)).toBe(refLongest(days))
      }),
      { numRuns: 400 },
    )
  })

  it('property: pausing any one day never shortens the run, and never lengthens it past the unpaused days', () => {
    fc.assert(
      fc.property(historyArb, fc.nat(), (days, pick) => {
        const i = pick % days.length
        const plain = days.map((d) => ({ ...d, paused: false }))
        const one = plain.map((d, j) => (j === i ? { ...d, paused: true } : d))
        const a = build(plain, false)
        const b = build(one, false)
        const before = currentRun(a.log, a.pauses, a.today)
        const after = currentRun(b.log, b.pauses, b.today)
        if (plain[i].kind === 'whole') expect(after).toBeLessThanOrEqual(before)
        else expect(after).toBeGreaterThanOrEqual(before)
      }),
      { numRuns: 300 },
    )
  })
})
