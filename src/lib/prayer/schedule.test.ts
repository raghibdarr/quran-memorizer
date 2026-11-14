import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { NOTIFY_RANGES, PRAYER_TAIL_ID, budgetFor, inRange } from '@/lib/notify/registry'
import { PRAYER_NAMES, type AlertMode, type Place, type PrayerAlert, type PrayerName } from '@/types/prayer'
import { computeDay, formatTime, isoInTz } from './engine'
import {
  START_SLOT,
  PRE_SLOT_OFFSET,
  TAIL_BODY,
  alertsPerDay,
  dayIndexOf,
  leadText,
  modesFor,
  planPrayerAlerts,
  type AlertPlan,
  type AlertPlatform,
  type AlertSettings,
  type PlannedAlert,
} from './schedule'

const LONDON: Place = { lat: 51.51, lng: -0.13, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'city' }
const NEW_YORK: Place = { lat: 40.71, lng: -74.01, label: 'New York', countryCode: 'US', tz: 'America/New_York', source: 'city' }
const MECCA: Place = { lat: 21.42, lng: 39.83, label: 'Mecca', countryCode: 'SA', tz: 'Asia/Riyadh', source: 'city' }
const JAKARTA: Place = { lat: -6.21, lng: 106.85, label: 'Jakarta', countryCode: 'ID', tz: 'Asia/Jakarta', source: 'city' }
const EDINBURGH: Place = { lat: 55.95, lng: -3.19, label: 'Edinburgh', countryCode: 'GB', tz: 'Europe/London', source: 'city' }
const SYDNEY: Place = { lat: -33.87, lng: 151.21, label: 'Sydney', countryCode: 'AU', tz: 'Australia/Sydney', source: 'city' }
const PLACES = [LONDON, NEW_YORK, MECCA, JAKARTA, EDINBURGH, SYDNEY]

const allAlerts = (mode: AlertMode, preAlertMin = 0): Record<PrayerName, PrayerAlert> =>
  Object.fromEntries(PRAYER_NAMES.map((p) => [p, { mode, preAlertMin }])) as Record<PrayerName, PrayerAlert>

const settingsWith = (alerts: Record<PrayerName, PrayerAlert>, extra: Partial<AlertSettings> = {}): AlertSettings => ({
  method: 'MuslimWorldLeague',
  madhab: 'standard',
  highLatRule: 'auto',
  offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  alerts,
  ...extra,
})

const NOW = Date.parse('2026-11-13T09:00:00Z')
const plan = (platform: AlertPlatform, alerts = allAlerts('default'), place: Place = LONDON, now = NOW, extra: Partial<AlertSettings> = {}) =>
  planPrayerAlerts({ now, place, settings: settingsWith(alerts, extra), platform })

const key = (a: PlannedAlert) => `${a.iso}|${a.prayer}|${a.kind}`

/** The invariants every plan keeps */
function expectWellFormed(p: AlertPlan, platform: AlertPlatform, now: number) {
  const ids = p.alerts.map((a) => a.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(p.alerts.length).toBeLessThanOrEqual(budgetFor(NOTIFY_RANGES.prayer, platform))
  if (platform === 'ios') expect(p.alerts.length).toBeLessThanOrEqual(48)
  for (let i = 0; i < p.alerts.length; i++) {
    const a = p.alerts[i]
    expect(inRange(a.id, NOTIFY_RANGES.prayer)).toBe(true)
    expect(a.at).toBeGreaterThan(now)
    if (i > 0) expect(a.at).toBeGreaterThanOrEqual(p.alerts[i - 1].at)
    const slot = START_SLOT[a.prayer] + (a.kind === 'pre' ? PRE_SLOT_OFFSET : 0)
    expect(a.id).toBe(20000 + dayIndexOf(a.iso) * 20 + slot)
    if (platform === 'ios') expect(a.mode).not.toBe('chime')
    expect(a.url).toBe('/prayer')
  }
  if (p.alerts.length) {
    expect(p.tail).not.toBeNull()
    expect(p.tail!.id).toBe(PRAYER_TAIL_ID)
    expect(p.tail!.at).toBe(p.alerts[p.alerts.length - 1].at)
    expect(p.tail!.body).toBe(TAIL_BODY)
  } else {
    expect(p.tail).toBeNull()
  }
}

describe('planPrayerAlerts', () => {
  it('plans nothing on the web or with every prayer off', () => {
    expect(plan('web')).toEqual({ alerts: [], tail: null, days: 0 })
    expect(plan('android', allAlerts('off', 10))).toEqual({ alerts: [], tail: null, days: 0 })
    expect(plan('ios', allAlerts('off'))).toEqual({ alerts: [], tail: null, days: 0 })
  })

  it('Android plans 30 days of every prayer and heads-up', () => {
    const p = plan('android', allAlerts('default', 10))
    expectWellFormed(p, 'android', NOW)
    const days = new Set(p.alerts.map((a) => a.iso))
    expect(days.size).toBe(30)
    expect(isoInTz(NOW, LONDON.tz)).toBe([...days][0])
    // Today's Fajr has gone; everything after it is there
    expect(p.alerts.length).toBe(30 * 10 - 2)
  })

  it('iOS plans whole days within the 48-slot budget, heads-ups included', () => {
    const tenADay = plan('ios', allAlerts('default', 10))
    expectWellFormed(tenADay, 'ios', NOW)
    // Today keeps 8 (Fajr and its heads-up passed); then 4 whole days of 10
    expect(tenADay.alerts.length).toBe(48)
    expect(tenADay.days).toBe(5)

    const fiveADay = plan('ios', allAlerts('default'))
    expectWellFormed(fiveADay, 'ios', NOW)
    expect(fiveADay.alerts.length).toBe(4 + 8 * 5)
    // Every day planned is whole (apart from today, already under way)
    const perDay = new Map<string, number>()
    for (const a of fiveADay.alerts) perDay.set(a.iso, (perDay.get(a.iso) ?? 0) + 1)
    expect([...perDay.values()].slice(1).every((n) => n === 5)).toBe(true)

    const one = plan('ios', { ...allAlerts('off'), fajr: { mode: 'default', preAlertMin: 0 } })
    expectWellFormed(one, 'ios', NOW)
    expect(one.alerts.length).toBe(48)
  })

  it('never exceeds the budget and keeps every invariant (property)', () => {
    const alertArb = fc.record({
      mode: fc.constantFrom<AlertMode>('off', 'silent', 'default', 'chime'),
      preAlertMin: fc.constantFrom(0, 5, 10, 60),
    })
    fc.assert(
      fc.property(
        fc.record({ fajr: alertArb, dhuhr: alertArb, asr: alertArb, maghrib: alertArb, isha: alertArb }),
        fc.constantFrom<AlertPlatform>('ios', 'android'),
        fc.constantFrom(...PLACES),
        fc.integer({ min: Date.parse('2026-01-01T00:00:00Z'), max: Date.parse('2027-12-31T00:00:00Z') }),
        (alerts, platform, place, now) => {
          const p = planPrayerAlerts({ now, place, settings: settingsWith(alerts), platform })
          expectWellFormed(p, platform, now)
          if (alertsPerDay(alerts) > 0) expect(p.alerts.length).toBeGreaterThan(0)
        },
      ),
      { numRuns: 40 },
    )
    // Heavy property run: give it room when the whole suite runs in parallel.
  }, 30_000)

  it('ids are stable for the same day and slot across replans', () => {
    const first = plan('android', allAlerts('default', 15))
    const later = plan('android', allAlerts('default', 15), LONDON, NOW + 5 * 3600_000)
    const nextDay = plan('android', allAlerts('default', 15), LONDON, NOW + 86_400_000)
    const ids = new Map(first.alerts.map((a) => [key(a), a.id]))
    let shared = 0
    for (const a of [...later.alerts, ...nextDay.alerts]) {
      if (!ids.has(key(a))) continue
      expect(a.id).toBe(ids.get(key(a)))
      shared++
    }
    expect(shared).toBeGreaterThan(400)
  })

  it('the tail sits at the last instant', () => {
    const p = plan('ios', allAlerts('silent', 5))
    const last = p.alerts[p.alerts.length - 1]
    expect(p.tail).toMatchObject({ id: 21000, at: last.at, body: 'Open Takrar to keep prayer alerts coming' })
  })

  it("changing one prayer's mode changes only its entries", () => {
    const base = { ...allAlerts('default', 10), maghrib: { mode: 'off' as AlertMode, preAlertMin: 10 } }
    const others = (p: AlertPlan, prayer: PrayerName) => p.alerts.filter((a) => a.prayer !== prayer)

    // Android: off to on, and a sound change
    const before = plan('android', base)
    const on = plan('android', { ...base, maghrib: { mode: 'default', preAlertMin: 10 } })
    expect(others(on, 'maghrib')).toEqual(others(before, 'maghrib'))
    expect(on.alerts.filter((a) => a.prayer === 'maghrib').length).toBeGreaterThan(0)
    const chime = plan('android', { ...base, asr: { mode: 'chime', preAlertMin: 10 } })
    expect(others(chime, 'asr')).toEqual(others(before, 'asr'))
    const asr = (p: AlertPlan) => p.alerts.filter((a) => a.prayer === 'asr')
    expect(asr(chime).map((a) => a.mode)).toEqual(asr(before).map(() => 'chime'))
    expect(asr(chime).map((a) => [a.id, a.at])).toEqual(asr(before).map((a) => [a.id, a.at]))

    // iOS: a sound change keeps the same days and ids
    const iosBefore = plan('ios', base)
    const iosSilent = plan('ios', { ...base, isha: { mode: 'silent', preAlertMin: 10 } })
    expect(others(iosSilent, 'isha')).toEqual(others(iosBefore, 'isha'))
    expect(iosSilent.alerts.filter((a) => a.prayer === 'isha').every((a) => a.mode === 'silent')).toBe(true)
  })

  it('iOS has no chime: it plays the system sound', () => {
    const p = plan('ios', allAlerts('chime'))
    expect(p.alerts.every((a) => a.mode === 'default')).toBe(true)
    expect(modesFor('ios')).not.toContain('chime')
    expect(modesFor('android')).toContain('chime')
  })

  it('writes "Dhuhr · 12:41" in the place zone, and heads-ups with their lead', () => {
    const p = plan('android', allAlerts('default', 10))
    const dhuhr = p.alerts.find((a) => a.prayer === 'dhuhr' && a.kind === 'start')!
    expect(dhuhr.body).toBe(`Dhuhr · ${formatTime(dhuhr.at, LONDON.tz)}`)
    expect(dhuhr.body).toMatch(/^Dhuhr · \d\d:\d\d$/)
    const pre = p.alerts.find((a) => a.prayer === 'dhuhr' && a.kind === 'pre')!
    expect(pre.at).toBe(dhuhr.at - 10 * 60_000)
    expect(pre.body).toBe(`Dhuhr in 10 min · ${formatTime(dhuhr.at, LONDON.tz)}`)
    const h12 = planPrayerAlerts({ now: NOW, place: LONDON, settings: settingsWith(allAlerts('default')), platform: 'android', hour12: true })
    expect(h12.alerts.find((a) => a.prayer === 'dhuhr')!.body).toMatch(/^Dhuhr · \d{1,2}:\d\d\s?(AM|PM)$/)
    expect(leadText(5)).toBe('5 min')
    expect(leadText(60)).toBe('1 h')
  })

  it('drops a heads-up already past but keeps its prayer', () => {
    const day = computeDay(LONDON, '2026-11-13', settingsWith(allAlerts('default')))
    const now = day.dhuhr! - 5 * 60_000
    const p = plan('android', allAlerts('default', 10), LONDON, now)
    const today = p.alerts.filter((a) => a.iso === '2026-11-13')
    expect(today.map((a) => `${a.prayer}:${a.kind}`)).toEqual(['dhuhr:start', 'asr:pre', 'asr:start', 'maghrib:pre', 'maghrib:start', 'isha:pre', 'isha:start'])
  })

  it('applies the engine offsets and follows the clocks across DST', () => {
    for (const [place, before, after] of [
      [LONDON, '2026-03-28', '2026-03-29'],
      [LONDON, '2026-10-24', '2026-10-25'],
      [NEW_YORK, '2026-03-07', '2026-03-08'],
      [NEW_YORK, '2026-10-31', '2026-11-01'],
    ] as const) {
      const now = Date.parse(`${before}T00:00:00Z`) - 86_400_000
      const extra = { offsets: { fajr: 0, sunrise: 0, dhuhr: 2, asr: 0, maghrib: 3, isha: 0 } }
      const p = plan('android', allAlerts('default'), place, now, extra)
      expectWellFormed(p, 'android', now)
      for (const iso of [before, after]) {
        const day = computeDay(place, iso, settingsWith(allAlerts('default'), extra))
        const got = p.alerts.filter((a) => a.iso === iso)
        expect(got.map((a) => a.prayer)).toEqual([...PRAYER_NAMES])
        for (const a of got) {
          expect(a.at).toBe(day[a.prayer])
          expect(a.body.endsWith(formatTime(a.at, place.tz))).toBe(true)
        }
      }
      // The sun keeps real time: Dhuhr stays about 24 h after the day before,
      // while the clock it is shown on jumps by the hour
      const d1 = p.alerts.find((a) => a.iso === before && a.prayer === 'dhuhr')!
      const d2 = p.alerts.find((a) => a.iso === after && a.prayer === 'dhuhr')!
      expect(Math.abs(d2.at - d1.at - 86_400_000)).toBeLessThan(2 * 60_000)
      const wall = (ms: number) => { const [h, m] = formatTime(ms, place.tz).split(':').map(Number); return h * 60 + m }
      expect(Math.abs(Math.abs(wall(d2.at) - wall(d1.at)) - 60)).toBeLessThanOrEqual(2)
    }
  })

  it('an Isha after midnight belongs to the day before and is not lost', () => {
    const extra = { highLatRule: 'middleofthenight' as const }
    const s = settingsWith(allAlerts('default'), extra)
    const isha21 = computeDay(EDINBURGH, '2026-06-21', s).isha!
    const isha22 = computeDay(EDINBURGH, '2026-06-22', s).isha!
    // The case under test: Isha of the 21st falls on the 22nd
    expect(isoInTz(isha21, EDINBURGH.tz)).toBe('2026-06-22')

    // Just after midnight on the 22nd, the 21st's Isha is still ahead
    const now = isha21 - 30 * 60_000
    expect(isoInTz(now, EDINBURGH.tz)).toBe('2026-06-22')
    for (const platform of ['android', 'ios'] as const) {
      const p = plan(platform, allAlerts('default'), EDINBURGH, now, extra)
      expectWellFormed(p, platform, now)
      const first = p.alerts[0]
      expect(first).toMatchObject({ prayer: 'isha', iso: '2026-06-21', at: isha21, id: 20000 + dayIndexOf('2026-06-21') * 20 + 4 })
      const next = p.alerts.find((a) => a.prayer === 'isha' && a.iso === '2026-06-22')!
      expect(next.at).toBe(isha22)
      expect(next.id).not.toBe(first.id)
      // One Isha per day, no doubles
      const ishas = p.alerts.filter((a) => a.prayer === 'isha').map((a) => a.iso)
      expect(new Set(ishas).size).toBe(ishas.length)
    }
  })

  it('keeps every invariant at high latitude and at the edges of the date line (property)', () => {
    const far: Place[] = [
      { lat: 69.65, lng: 18.96, label: 'Tromso', countryCode: 'NO', tz: 'Europe/Oslo', source: 'city' },
      { lat: 64.15, lng: -21.94, label: 'Reykjavik', countryCode: 'IS', tz: 'Atlantic/Reykjavik', source: 'city' },
      { lat: 78.22, lng: 15.65, label: 'Longyearbyen', countryCode: 'SJ', tz: 'Arctic/Longyearbyen', source: 'city' },
      { lat: 1.87, lng: -157.43, label: 'Kiritimati', countryCode: 'KI', tz: 'Pacific/Kiritimati', source: 'city' },
      { lat: 21.31, lng: -157.86, label: 'Honolulu', countryCode: 'US', tz: 'Pacific/Honolulu', source: 'city' },
      { lat: -13.83, lng: -171.77, label: 'Apia', countryCode: 'WS', tz: 'Pacific/Apia', source: 'city' },
    ]
    fc.assert(
      fc.property(
        fc.constantFrom<AlertPlatform>('ios', 'android'),
        fc.constantFrom(...far),
        fc.constantFrom(0, 15, 60),
        fc.integer({ min: Date.parse('2026-01-01T00:00:00Z'), max: Date.parse('2027-12-31T00:00:00Z') }),
        (platform, place, pre, now) => {
          const p = planPrayerAlerts({ now, place, settings: settingsWith(allAlerts('default', pre)), platform })
          expectWellFormed(p, platform, now)
          for (const a of p.alerts) {
            expect(Number.isFinite(a.at)).toBe(true)
            // The text shows the place's own clock
            if (a.kind === 'start') expect(a.body.endsWith(formatTime(a.at, place.tz))).toBe(true)
            // A prayer belongs to its own day or, past midnight, the day before
            const fired = isoInTz(a.kind === 'start' ? a.at : a.at + pre * 60_000, place.tz)
            expect(Math.abs(Date.parse(fired) - Date.parse(a.iso))).toBeLessThanOrEqual(86_400_000)
          }
        },
      ),
      { numRuns: 60 },
    )
    // Heavy property run: give it room when the whole suite runs in parallel.
  }, 30_000)

  it('leaves out a time the engine puts days away from its own day (78°N, late February)', () => {
    const svalbard: Place = { lat: 78.22, lng: 15.65, label: 'Longyearbyen', countryCode: 'SJ', tz: 'Arctic/Longyearbyen', source: 'city' }
    // The seed that found it: 20 Jan 2027, whose 30 days reach 18 Feb, where Asr comes out on the 22nd
    const now = 1800399600000
    const p = plan('android', allAlerts('default'), svalbard, now)
    expectWellFormed(p, 'android', now)
    for (const a of p.alerts) {
      expect(Math.abs(Date.parse(isoInTz(a.at, svalbard.tz)) - Date.parse(a.iso))).toBeLessThanOrEqual(86_400_000)
    }
    expect(p.alerts.some((a) => a.iso === '2027-02-18' && a.prayer === 'dhuhr')).toBe(true)
    expect(p.alerts.some((a) => a.iso === '2027-02-18' && a.prayer === 'asr')).toBe(false)
  })

  it('a traveller far from the device clock is planned by the place, not the device', () => {
    // 09:00 UTC on the 13th is already 23:00 on the 13th in Kiritimati (UTC+14) and 23:00 on the 12th in Honolulu
    const kiritimati: Place = { lat: 1.87, lng: -157.43, label: 'Kiritimati', countryCode: 'KI', tz: 'Pacific/Kiritimati', source: 'city' }
    const honolulu: Place = { lat: 21.31, lng: -157.86, label: 'Honolulu', countryCode: 'US', tz: 'Pacific/Honolulu', source: 'city' }
    const k = plan('android', allAlerts('default'), kiritimati)
    const h = plan('android', allAlerts('default'), honolulu)
    expect(k.alerts[0]).toMatchObject({ prayer: 'fajr', iso: '2026-11-14' })
    expect(h.alerts[0]).toMatchObject({ prayer: 'fajr', iso: '2026-11-13' })
    expectWellFormed(k, 'android', NOW)
    expectWellFormed(h, 'android', NOW)
  })

  it('day indexes wrap within the 50-day id window', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 50; i++) seen.add(dayIndexOf(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)))
    expect(seen.size).toBe(50)
    expect(dayIndexOf('1970-01-01')).toBe(0)
    expect(dayIndexOf('1970-02-20')).toBe(0)
  })
})
