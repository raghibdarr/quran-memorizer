import { afterEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import fs from 'node:fs'
import path from 'node:path'
import { forceTabularForTests } from '@/lib/hijri/convert'
import type { FastEntry, FastMark, Pause } from '@/stores/worship-store'
import {
  BANNER_LEAD_DAYS,
  activePause,
  countFasts,
  fastOptionsFor,
  fastTimes,
  fastTimesToShow,
  formatClock,
  formatCountdown,
  isPaused,
  latestRamadan,
  makeUpList,
  nextFastMoment,
  ramadanDays,
  ramadanSeason,
  resumeOf,
  seasonLine,
} from './ramadan'

afterEach(() => forceTabularForTests(false))

const MIN = 60_000
const at = (h: number, m = 0) => Date.UTC(2027, 1, 10, h, m)

describe('suhoor and iftar', () => {
  const day = { fajr: at(5, 30), maghrib: at(17, 40) }

  it('suhoor ends the precaution minutes before Fajr; iftar is Maghrib', () => {
    expect(fastTimes(day, 10)).toEqual({ suhoorEnd: at(5, 20), fajr: at(5, 30), iftar: at(17, 40) })
    expect(fastTimes(day, 0).suhoorEnd).toBe(at(5, 30))
    expect(fastTimes(day, -5).suhoorEnd).toBe(at(5, 30))
    expect(fastTimes({ fajr: null, maghrib: null }, 10)).toEqual({ suhoorEnd: null, fajr: null, iftar: null })
  })

  it('counts down to suhoor end, then iftar, then tomorrow', () => {
    const today = fastTimes(day, 10)
    const tomorrow = fastTimes({ fajr: day.fajr + 1440 * MIN - 2 * MIN, maghrib: day.maghrib + 1440 * MIN }, 10)
    expect(nextFastMoment(at(3), today, tomorrow)).toEqual({ kind: 'suhoor', at: at(5, 20) })
    expect(nextFastMoment(at(5, 25), today, tomorrow)).toEqual({ kind: 'iftar', at: at(17, 40) })
    expect(nextFastMoment(at(17, 40), today, tomorrow)).toEqual({ kind: 'suhoor', at: tomorrow.suhoorEnd })
    expect(nextFastMoment(at(17, 40), today, fastTimes({ fajr: null, maghrib: null }))).toBeNull()
  })
})

describe('formatting', () => {
  it('clock in the place zone, countdown rounded up', () => {
    expect(formatClock(at(5, 20), 'UTC')).toBe('05:20')
    expect(formatClock(at(5, 20), 'Asia/Karachi')).toBe('10:20')
    expect(formatCountdown(at(17, 40), at(15, 36))).toBe('in 2 h 4 min')
    expect(formatCountdown(at(17, 40), at(17, 28))).toBe('in 12 min')
    expect(formatCountdown(at(17, 40), at(15, 40))).toBe('in 2 h')
    expect(formatCountdown(at(17, 40), at(17, 40))).toBe('now')
    expect(formatCountdown(at(17, 40), at(17, 39) + 30_000)).toBe('in 1 min')
  })
})

describe('season (Ramadan 1448 expected 8 February – 8 March 2027)', () => {
  it('auto: off until the calendar says Ramadan', () => {
    const before = ramadanSeason('2027-01-01')
    expect([before.inRamadan, before.active, before.bannerVisible, before.hijriYear]).toEqual([false, false, false, 1448])
    expect(before.start).toBe('2027-02-08')
    expect(before.daysUntilStart).toBe(38)

    const during = ramadanSeason('2027-02-20')
    expect([during.inRamadan, during.active, during.bannerVisible, during.day, during.daysUntilStart]).toEqual([true, true, true, 13, 0])

    const after = ramadanSeason('2027-03-09') // Eid: the next Ramadan is in view
    expect([after.inRamadan, after.active, after.hijriYear]).toEqual([false, false, 1449])
  })

  it('the banner shows from 7 days before the start through the month', () => {
    expect(ramadanSeason('2027-01-31').bannerVisible).toBe(false) // 8 days before
    expect(ramadanSeason('2027-02-01').bannerVisible).toBe(true) // 7 days before
    expect(ramadanSeason('2027-02-07').bannerVisible).toBe(true)
    expect(ramadanSeason('2027-03-08').bannerVisible).toBe(true) // last day
    expect(ramadanSeason('2027-03-09').bannerVisible).toBe(false)
    expect(BANNER_LEAD_DAYS).toBe(7)
  })

  it('manual on and off win over the calendar', () => {
    expect(ramadanSeason('2026-11-13', 0, 'on')).toMatchObject({ active: true, bannerVisible: true, inRamadan: false })
    expect(ramadanSeason('2027-02-20', 0, 'off')).toMatchObject({ active: false, bannerVisible: false, inRamadan: true })
    expect(ramadanSeason('2027-02-03', 0, 'off').bannerVisible).toBe(false)
  })

  it('the offset moves the season', () => {
    expect(ramadanSeason('2027-02-07', 1)).toMatchObject({ inRamadan: true, day: 1, start: '2027-02-07' })
    expect(ramadanSeason('2027-02-08', -1)).toMatchObject({ inRamadan: false, daysUntilStart: 1, start: '2027-02-09' })
    expect(ramadanSeason('2027-01-31', 1).bannerVisible).toBe(true)
  })

  it('works on the tabular fallback', () => {
    forceTabularForTests(true)
    const s = ramadanSeason('2027-02-20')
    expect([s.inRamadan, s.start, s.length]).toEqual([true, '2027-02-08', 30])
  })

  it('latest Ramadan begun: this one while it runs, else the one before', () => {
    expect(latestRamadan('2027-02-20').hijriYear).toBe(1448)
    expect(latestRamadan('2027-06-01').hijriYear).toBe(1448)
    expect(latestRamadan('2027-01-01').hijriYear).toBe(1447)
    const days = ramadanDays(latestRamadan('2027-02-20'))
    expect(days).toHaveLength(29)
    expect(days[0]).toEqual({ iso: '2027-02-08', day: 1 })
    expect(days[28]).toEqual({ iso: '2027-03-08', day: 29 })
  })

  it('a day offers all three marks in Ramadan, else a voluntary fast', () => {
    expect(fastOptionsFor('2027-02-20')).toEqual(['fasted', 'owed', 'exempt'])
    expect(fastOptionsFor('2027-04-20')).toEqual(['fasted'])
    expect(fastOptionsFor('2027-04-20', 0, true)).toEqual(['fasted', 'owed', 'exempt'])
  })

  it('season lines', () => {
    expect(seasonLine(ramadanSeason('2027-02-20'))).toBe('Day 13 of Ramadan')
    expect(seasonLine(ramadanSeason('2027-02-07'))).toBe('Ramadan is expected tomorrow')
    expect(seasonLine(ramadanSeason('2027-02-03'))).toBe('Ramadan is expected in 5 days')
    expect(seasonLine(ramadanSeason('2026-11-13', 0, 'on'))).toBe('Ramadan mode is on')
  })
})

const fast = (s: FastMark): FastEntry => ({ s, at: 1 })

describe('season, any day and offset (property)', () => {
  const isoArb = fc
    .integer({ min: Math.round(Date.UTC(1995, 0, 1) / 864e5), max: Math.round(Date.UTC(2055, 11, 31) / 864e5) })
    .map((n) => new Date(n * 864e5).toISOString().slice(0, 10))

  for (const tabular of [false, true]) {
    it(`the season, the banner and the log span agree (${tabular ? 'tabular' : 'Intl'})`, () => {
      forceTabularForTests(tabular)
      fc.assert(
        fc.property(isoArb, fc.integer({ min: -2, max: 2 }), (iso, offset) => {
          const s = ramadanSeason(iso, offset, 'auto')
          const inSpan = iso >= s.start && iso <= s.end
          expect(s.inRamadan).toBe(inSpan)
          expect(s.active).toBe(inSpan)
          if (inSpan) {
            expect(s.daysUntilStart).toBe(0)
            expect(ramadanDays(s)[s.day! - 1].iso).toBe(iso)
            expect(latestRamadan(iso, offset)).toEqual({ hijriYear: s.hijriYear, start: s.start, end: s.end, length: s.length })
          } else {
            // The season in view is always the next one, under a year away
            expect(s.day).toBeNull()
            expect(s.daysUntilStart).toBeGreaterThan(0)
            expect(s.daysUntilStart).toBeLessThan(356)
            expect(s.bannerVisible).toBe(s.daysUntilStart <= BANNER_LEAD_DAYS)
            // and the log shows the one that last ended
            const last = latestRamadan(iso, offset)
            expect(last.end < iso).toBe(true)
            expect(last.hijriYear).toBe(s.hijriYear - 1)
          }
          expect([29, 30]).toContain(s.length)
          expect(ramadanSeason(iso, offset, 'off').bannerVisible).toBe(false)
          expect(ramadanSeason(iso, offset, 'on').active).toBe(true)
        }),
        { numRuns: 150 },
      )
    })
  }
})

describe('where the engine has no Fajr or Maghrib (high latitude)', () => {
  it('counts to whichever time exists, and to nothing when neither does', () => {
    const none = fastTimes({ fajr: null, maghrib: null }, 10)
    expect(none).toEqual({ suhoorEnd: null, fajr: null, iftar: null })
    expect(nextFastMoment(at(12), none, none)).toBeNull()
    const noFajr = fastTimes({ fajr: null, maghrib: at(22) }, 10)
    expect(nextFastMoment(at(1), noFajr, noFajr)).toEqual({ kind: 'iftar', at: at(22) })
    const noMaghrib = fastTimes({ fajr: at(2), maghrib: null }, 10)
    expect(nextFastMoment(at(12), noMaghrib, fastTimes({ fajr: at(26), maghrib: null }, 10))).toEqual({ kind: 'suhoor', at: at(26) - 10 * MIN })
  })
})

describe('the times listed under the countdown', () => {
  it("are today's until iftar, then tomorrow's, matching what the countdown runs to", () => {
    const today = fastTimes({ fajr: at(5), maghrib: at(18) }, 10)
    const tomorrow = fastTimes({ fajr: at(29) - 2 * MIN, maghrib: at(42) + MIN }, 10)
    expect(fastTimesToShow(at(3), today, tomorrow)).toEqual({ day: 'today', times: today })
    expect(fastTimesToShow(at(18) - 1, today, tomorrow)).toEqual({ day: 'today', times: today })
    const after = fastTimesToShow(at(18), today, tomorrow)
    expect(after).toEqual({ day: 'tomorrow', times: tomorrow })
    expect(nextFastMoment(at(22), today, tomorrow)).toEqual({ kind: 'suhoor', at: after.times.suhoorEnd })
    // no Maghrib today (high latitude): stay on today
    const noMaghrib = fastTimes({ fajr: at(2), maghrib: null })
    expect(fastTimesToShow(at(23), noMaghrib, tomorrow).day).toBe('today')
  })
})

describe('pauses', () => {
  const pauses: Pause[] = [{ id: 'a', from: '2027-02-10', to: '2027-02-14' }, { id: 'b', from: '2027-03-01' }]

  it('cover their days, open-ended ones onwards', () => {
    expect(isPaused('2027-02-09', pauses)).toBe(false)
    expect(isPaused('2027-02-10', pauses)).toBe(true)
    expect(isPaused('2027-02-14', pauses)).toBe(true)
    expect(isPaused('2027-02-15', pauses)).toBe(false)
    expect(isPaused('2027-08-01', pauses)).toBe(true)
  })

  it('the running pause', () => {
    expect(activePause(pauses, '2027-02-12')?.id).toBe('a')
    expect(activePause(pauses, '2027-02-20')).toBeNull()
    expect(activePause(pauses, '2027-03-05')?.id).toBe('b')
  })

  it('resuming counts today again', () => {
    expect(resumeOf({ id: 'b', from: '2027-03-01' }, '2027-03-05')).toEqual({ kind: 'end', to: '2027-03-04' })
    expect(resumeOf({ id: 'c', from: '2027-03-05' }, '2027-03-05')).toEqual({ kind: 'remove' })
  })
})

describe('fasting log arithmetic', () => {
  const fasts: Record<string, FastEntry> = {
    '2026-02-20': fast('owed'), // last Ramadan
    '2027-02-08': fast('fasted'),
    '2027-02-09': fast('owed'),
    '2027-02-10': fast('owed'), // paused
    '2027-02-11': fast('exempt'),
    '2027-02-12': fast('fasted'),
    '2027-04-15': fast('fasted'), // a voluntary fast
  }
  const pauses: Pause[] = [{ id: 'a', from: '2027-02-10', to: '2027-02-10' }]

  it('counts each mark, leaving out paused days', () => {
    expect(countFasts(fasts, pauses)).toEqual({ fasted: 3, owed: 2, exempt: 1 })
    expect(countFasts(fasts, [])).toEqual({ fasted: 3, owed: 3, exempt: 1 })
    expect(countFasts(fasts, pauses, { from: '2027-02-08', to: '2027-03-08' })).toEqual({ fasted: 2, owed: 1, exempt: 1 })
  })

  it('the make-up list carries across Ramadans, oldest first, exempt and paused days out', () => {
    expect(makeUpList(fasts, 0, pauses)).toEqual({
      days: [{ iso: '2026-02-20', done: false }, { iso: '2027-02-09', done: false }],
      left: 2,
      madeUp: 0,
    })
    expect(makeUpList(fasts, 1, pauses)).toEqual({
      days: [{ iso: '2026-02-20', done: true }, { iso: '2027-02-09', done: false }],
      left: 1,
      madeUp: 1,
    })
    // More made up than owed: nothing left, never below zero
    expect(makeUpList(fasts, 5, pauses).left).toBe(0)
    expect(makeUpList({}, 0, []).left).toBe(0)
  })

  it('left = owed - made up, never negative (property)', () => {
    const iso = fc.integer({ min: 0, max: 800 }).map((n) => new Date(Date.UTC(2026, 0, 1) + n * 864e5).toISOString().slice(0, 10))
    fc.assert(
      fc.property(
        fc.dictionary(iso, fc.constantFrom<FastMark>('fasted', 'owed', 'exempt').map(fast)),
        fc.integer({ min: 0, max: 50 }),
        fc.array(fc.tuple(iso, fc.integer({ min: 0, max: 30 })), { maxLength: 3 }),
        (log, madeUp, raw) => {
          const ps: Pause[] = raw.map(([from, len], i) => ({ id: String(i), from, to: new Date(Date.parse(from) + len * 864e5).toISOString().slice(0, 10) }))
          const list = makeUpList(log, madeUp, ps)
          const owed = countFasts(log, ps).owed
          expect(list.days).toHaveLength(owed)
          expect(list.left).toBe(Math.max(0, owed - madeUp))
          expect(list.days.filter((d) => d.done)).toHaveLength(Math.min(owed, madeUp))
          // Pausing can only lower the count
          expect(owed).toBeLessThanOrEqual(countFasts(log, []).owed)
        },
      ),
    )
  })
})

describe('copy: no negative wording on the Ramadan and calendar screens', () => {
  const root = path.resolve(__dirname, '../..')
  const files = [
    'lib/worship/ramadan.ts',
    'lib/hijri/events.ts',
    'data/hijri-events.json',
    'app/calendar/page.tsx',
    'app/ramadan/page.tsx',
    'components/prayer/slots/hijri-line.tsx',
    'components/prayer/slots/ramadan-banner.tsx',
  ]
  const dirs = ['components/calendar', 'components/ramadan']
  const all = [
    ...files,
    ...dirs.flatMap((d) => (fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d)).map((f) => `${d}/${f}`) : [])),
  ]
  const banned = [
    'missed', 'miss ', 'failed', 'failure', 'fail ', 'broke', 'broken', 'behind', 'guilt', 'shame', 'lazy',
    'should have', 'overdue', 'penalty', 'punish', 'sinful', 'debt', 'streak', 'warning', 'bad ', 'wrong',
  ]

  it('scans the screens it should', () => {
    expect(all.length).toBeGreaterThan(7)
  })

  for (const f of all) {
    it(f, () => {
      const text = fs.readFileSync(path.join(root, f), 'utf8').toLowerCase()
      for (const w of banned) expect(text.includes(w), `"${w.trim()}" in ${f}`).toBe(false)
    })
  }
})
