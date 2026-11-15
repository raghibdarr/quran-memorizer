import { describe, expect, it } from 'vitest'
import { buildHub, dayTimes, inOrder, inRamadan, stripLine, zoneDiffers, zoneOffsetMin, type ModelSettings } from './model'
import { currentPrayer, currentWindow, formatTime, nextPrayer } from '@/lib/prayer/engine'

const ZERO = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
const S: ModelSettings = { method: 'UmmAlQura', madhab: 'standard', highLatRule: 'auto', offsets: ZERO, hijriOffset: 0, ramadanMode: 'off' }
const MAKKAH = { lat: 21.42, lng: 39.83, tz: 'Asia/Riyadh' }
// 15 March 2026 in Makkah (adhan reference, engine.test.ts): Fajr 05:14, Sunrise 06:29,
// Dhuhr 12:30, Asr 15:54, Maghrib 18:30, Isha 20:00 (UTC+3)
const at = (hhmm: string, day = '2026-03-15') => Date.parse(`${day}T${hhmm}:00+03:00`)

describe('buildHub', () => {
  it('highlights the next prayer and the one whose time is in', () => {
    const m = buildHub(MAKKAH, S, at('14:00'))
    expect(m.iso).toBe('2026-03-15')
    expect(m.next?.prayer).toBe('asr')
    expect(m.rows.filter((r) => r.isNext).map((r) => r.name)).toEqual(['asr'])
    expect(m.rows.filter((r) => r.isCurrent).map((r) => r.name)).toEqual(['dhuhr'])
    expect(m.nextIsTomorrow).toBe(false)
    expect(m.current?.prayer).toBe('dhuhr')
    expect(m.missing).toEqual([])
  })

  it('gives six rows in order, each ending where the next begins and Isha at the next Fajr', () => {
    const m = buildHub(MAKKAH, S, at('10:00'))
    expect(m.rows.map((r) => r.name)).toEqual(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'])
    for (let i = 0; i < 5; i++) expect(m.rows[i].endMs).toBe(m.rows[i + 1].startMs)
    expect(formatTime(m.rows[5].endMs!, MAKKAH.tz)).toMatch(/^05:1\d$/)
    expect(m.rows[5].endMs! - m.rows[5].startMs!).toBeGreaterThan(8 * 3_600_000)
  })

  it('rolls to tomorrow’s Fajr after Isha, with nothing highlighted in today’s list', () => {
    const m = buildHub(MAKKAH, S, at('21:00'))
    expect(m.next?.prayer).toBe('fajr')
    expect(m.next?.iso).toBe('2026-03-16')
    expect(m.nextIsTomorrow).toBe(true)
    expect(m.rows.some((r) => r.isNext)).toBe(false)
    expect(m.current?.prayer).toBe('isha')
  })

  it('has no prayer in between sunrise and Dhuhr, and the morning window from Fajr to sunrise', () => {
    expect(buildHub(MAKKAH, S, at('09:00')).current).toBeNull()
    expect(buildHub(MAKKAH, S, at('05:30')).window).toBe('morning')
    expect(buildHub(MAKKAH, S, at('16:00')).window).toBe('evening')
    expect(buildHub(MAKKAH, S, at('19:00')).window).toBeNull()
  })

  it('names missing times instead of inventing them (a fixed rule in polar summer)', () => {
    const tromso = { lat: 69.65, lng: 18.96, tz: 'Europe/Oslo' }
    const m = buildHub(tromso, { ...S, method: 'MuslimWorldLeague', highLatRule: 'middleofthenight' }, Date.parse('2026-06-21T12:00:00+02:00'))
    expect(m.missing.length).toBeGreaterThan(0)
    for (const r of m.rows) if (m.missing.includes(r.name)) expect(r.startMs).toBeNull()
  })
})

describe('the day read top to bottom', () => {
  it('marks passed times, the one in now and the next, and nothing later', () => {
    const m = buildHub(MAKKAH, S, at('14:00'))
    const state = (r: (typeof m.rows)[number]) => (r.isPassed ? 'passed' : r.isCurrent ? 'now' : r.isNext ? 'next' : 'later')
    expect(m.rows.map(state)).toEqual(['passed', 'passed', 'now', 'next', 'later', 'later'])
  })

  it('after Isha: Isha is now and the rest of today has passed', () => {
    const m = buildHub(MAKKAH, S, at('21:00'))
    expect(m.rows.filter((r) => r.isCurrent).map((r) => r.name)).toEqual(['isha'])
    expect(m.rows.filter((r) => !r.isCurrent).every((r) => r.isPassed)).toBe(true)
  })
})

describe('inOrder', () => {
  const H = 3_600_000
  const row = (name: 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', h: number | null) => ({ name, startMs: h === null ? null : h * H, endMs: null as number | null })
  const day = (hs: Array<number | null>) => {
    const names = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const
    const rows = names.map((n, i) => row(n, hs[i]))
    rows.forEach((r, i) => (r.endMs = i < 5 ? rows[i + 1].startMs : 29 * H))
    return rows
  }

  it('leaves an ordinary day alone', () => {
    const rows = day([5, 6.5, 12.5, 15.9, 18.5, 20])
    expect(inOrder(rows)).toEqual(rows)
  })

  it('drops an Asr before Dhuhr (far north in winter) and lets Dhuhr run to the next time', () => {
    const out = inOrder(day([6, null, 11.5, 10.9, 13, 15]))
    expect(out.map((r) => r.startMs)).toEqual([6 * H, null, 11.5 * H, null, 13 * H, 15 * H])
    expect(out[2].endMs).toBe(13 * H)
    expect(out[0].endMs).toBe(null) // ended at the missing sunrise before; unchanged
  })

  it('never lists times out of order, Tromsø in December included', () => {
    const tromso = { lat: 69.65, lng: 18.96, tz: 'Europe/Oslo' }
    for (const day of ['2026-12-01', '2026-12-21', '2027-01-10']) {
      const m = buildHub(tromso, { ...S, method: 'MuslimWorldLeague' }, Date.parse(`${day}T11:40:00+01:00`))
      const times = m.rows.map((r) => r.startMs).filter((t): t is number => t !== null)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      const now = m.rows.find((r) => r.isCurrent)
      if (now) expect(now.startMs!).toBeLessThanOrEqual(Date.parse(`${day}T11:40:00+01:00`))
    }
  })

  it('moves "now" to the kept prayer when the engine’s lands on a dropped time', () => {
    const tromso = { lat: 69.65, lng: 18.96, tz: 'Europe/Oslo' }
    const m = buildHub(tromso, { ...S, method: 'MuslimWorldLeague' }, Date.parse('2026-12-21T12:00:00+01:00'))
    expect(m.rows.find((r) => r.name === 'asr')!.startMs).toBeNull()
    expect(m.current?.prayer).toBe('dhuhr')
    expect(m.rows.filter((r) => r.isCurrent).map((r) => r.name)).toEqual(['dhuhr'])
  })

  it('never offers a dropped time as the next prayer, on the hub or the Home strip', () => {
    // Tromsø, 21 December, Muslim World League: the engine puts Asr at 10:52, before Dhuhr at 11:32
    const tromso = { lat: 69.65, lng: 18.96, tz: 'Europe/Oslo' }
    const s = { ...S, method: 'MuslimWorldLeague' as const }
    const now = Date.parse('2026-12-21T10:45:00+01:00')
    const m = buildHub(tromso, s, now)
    expect(m.next?.prayer).toBe('dhuhr')
    expect(m.rows.filter((r) => r.isNext).map((r) => r.name)).toEqual(['dhuhr'])
    expect(stripLine(tromso, s, now)?.prayer).toBe('dhuhr')
  })

  it('offers no evening adhkar from a dropped Asr, and previews the same times the hub lists', () => {
    const tromso = { lat: 69.65, lng: 18.96, tz: 'Europe/Oslo' }
    const s = { ...S, method: 'MuslimWorldLeague' as const }
    for (const hhmm of ['11:10', '11:50']) {
      const now = Date.parse(`2026-12-21T${hhmm}:00+01:00`)
      const m = buildHub(tromso, s, now)
      expect(m.window).toBeNull()
      const preview = dayTimes(tromso, s, now)
      for (const r of m.rows) expect(preview[r.name]).toBe(r.startMs)
      expect(preview.asr).toBeNull()
    }
  })

  it('agrees with the engine on an ordinary day', () => {
    for (const hhmm of ['00:30', '05:30', '09:00', '13:00', '16:30', '19:00', '23:00']) {
      const now = at(hhmm)
      const m = buildHub(MAKKAH, S, now)
      expect(m.next).toEqual(nextPrayer(MAKKAH, S, now))
      expect(m.current).toEqual(currentPrayer(MAKKAH, S, now))
      expect(m.window).toBe(currentWindow(MAKKAH, S, now))
    }
  })

  it('drops a morning time that comes after the one following it', () => {
    const out = inOrder(day([7, 6.5, 12, 15, 18, 20]))
    expect(out.map((r) => r.startMs)).toEqual([null, 6.5 * H, 12 * H, 15 * H, 18 * H, 20 * H])
  })
})

describe('buildHub at the edges of the day', () => {
  const MWL: ModelSettings = { ...S, method: 'MuslimWorldLeague' }

  it('marks a time that falls past midnight, and none in an ordinary day', () => {
    expect(buildHub(MAKKAH, S, at('14:00')).rows.every((r) => r.dayShift === 0)).toBe(true)
    // Reykjavik at midsummer: the sun sets after midnight, so Maghrib and Isha belong to the next calendar day
    const reykjavik = { lat: 64.15, lng: -21.94, tz: 'Atlantic/Reykjavik' }
    const m = buildHub(reykjavik, MWL, Date.parse('2026-06-21T12:00:00Z'))
    const shift = Object.fromEntries(m.rows.map((r) => [r.name, r.dayShift]))
    expect(shift).toMatchObject({ fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 1, isha: 1 })
    expect(formatTime(m.rows[4].startMs!, reykjavik.tz)).toMatch(/^00:/)
    expect(m.missing).toEqual([])
  })

  it('keeps the late Isha of the day before as the next prayer after midnight, without marking a row of the new day', () => {
    // London, midsummer, middle-of-the-night rule: Isha of the 21st comes at about 01:02 on the 22nd
    const london = { lat: 51.51, lng: -0.13, tz: 'Europe/London' }
    const m = buildHub(london, { ...MWL, highLatRule: 'middleofthenight' }, Date.parse('2026-06-21T23:20:00Z'))
    expect(m.iso).toBe('2026-06-22')
    expect(m.next).toMatchObject({ prayer: 'isha', iso: '2026-06-21' })
    expect(m.nextIsTomorrow).toBe(false)
    expect(m.rows.some((r) => r.isNext)).toBe(false)
    expect(m.current).toMatchObject({ prayer: 'maghrib', iso: '2026-06-21' })
  })

  it('reads the right day and times across a daylight-saving change', () => {
    const london = { lat: 51.51, lng: -0.13, tz: 'Europe/London' }
    // 29 March 2026: clocks go forward at 01:00 UTC
    const before = buildHub(london, MWL, Date.parse('2026-03-29T00:30:00Z'))
    const after = buildHub(london, MWL, Date.parse('2026-03-29T02:30:00Z'))
    for (const m of [before, after]) {
      expect(m.iso).toBe('2026-03-29')
      expect(m.next).toMatchObject({ prayer: 'fajr', iso: '2026-03-29' })
      expect(m.current).toMatchObject({ prayer: 'isha', iso: '2026-03-28' })
      expect(m.rows.every((r) => r.dayShift === 0)).toBe(true)
    }
    expect(before.rows.map((r) => r.startMs)).toEqual(after.rows.map((r) => r.startMs))
    // Dhuhr is on summer time (about 13:06), and the countdown to Fajr spans the lost hour
    expect(formatTime(before.rows[2].startMs!, london.tz)).toMatch(/^13:0\d$/)
    expect(stripLine(london, MWL, Date.parse('2026-03-29T00:30:00Z'))?.until).toMatch(/^in 3 h \d+ min$/)
    // 25 October 2026: clocks go back; 00:30 UTC is 01:30 BST
    const autumn = buildHub(london, MWL, Date.parse('2026-10-25T00:30:00Z'))
    expect(autumn.iso).toBe('2026-10-25')
    expect(formatTime(autumn.rows[2].startMs!, london.tz)).toMatch(/^11:4\d$/)
  })

  it('goes by the calendar day at the place, not in UTC or on the phone', () => {
    const now = Date.parse('2026-03-15T11:00:00Z')
    // 00:00 on the 16th in Apia (UTC+13), 01:00 on the 15th in Honolulu (UTC-10)
    expect(buildHub({ lat: -13.83, lng: -171.77, tz: 'Pacific/Apia' }, MWL, now)).toMatchObject({ iso: '2026-03-16', next: { prayer: 'fajr', iso: '2026-03-16' } })
    expect(buildHub({ lat: 21.31, lng: -157.86, tz: 'Pacific/Honolulu' }, MWL, now)).toMatchObject({ iso: '2026-03-15', next: { prayer: 'fajr', iso: '2026-03-15' } })
  })

  it('gives every time with the automatic rule in polar summer, and in the far south', () => {
    const auto = buildHub({ lat: 69.65, lng: 18.96, tz: 'Europe/Oslo' }, MWL, Date.parse('2026-06-21T12:00:00+02:00'))
    expect(auto.missing).toEqual([])
    expect(auto.next?.prayer).toBe('dhuhr')
    const ushuaia = buildHub({ lat: -54.8, lng: -68.3, tz: 'America/Argentina/Ushuaia' }, MWL, Date.parse('2026-12-21T15:00:00Z'))
    expect(ushuaia.missing).toEqual([])
    for (let i = 1; i < 6; i++) expect(ushuaia.rows[i].startMs!).toBeGreaterThan(ushuaia.rows[i - 1].startMs!)
  })
})

describe('inRamadan', () => {
  // 1 Ramadan 1448 is expected about 8 February 2027
  const mid = Date.parse('2027-02-20T12:00:00+03:00')
  const before = Date.parse('2027-01-10T12:00:00+03:00')

  it('follows the Hijri date at the place in auto mode', () => {
    expect(inRamadan(MAKKAH, { ramadanMode: 'auto', hijriOffset: 0 }, mid)).toBe(true)
    expect(inRamadan(MAKKAH, { ramadanMode: 'auto', hijriOffset: 0 }, before)).toBe(false)
  })

  it('obeys the user’s on and off', () => {
    expect(inRamadan(MAKKAH, { ramadanMode: 'on', hijriOffset: 0 }, before)).toBe(true)
    expect(inRamadan(MAKKAH, { ramadanMode: 'off', hijriOffset: 0 }, mid)).toBe(false)
  })
})

describe('stripLine', () => {
  it('reads "Asr 15:54 · in 1 h 54 min"', () => {
    expect(stripLine(MAKKAH, S, at('14:00'))).toEqual({ label: 'Asr', time: '15:54', until: 'in 1 h 54 min', prayer: 'asr' })
  })

  it('says Iftar for Maghrib in Ramadan only', () => {
    const afterAsr = at('17:00')
    expect(stripLine(MAKKAH, S, afterAsr)?.label).toBe('Maghrib')
    expect(stripLine(MAKKAH, { ...S, ramadanMode: 'on' }, afterAsr)).toMatchObject({ label: 'Iftar', time: '18:30', until: 'in 1 h 30 min' })
    expect(stripLine(MAKKAH, { ...S, ramadanMode: 'on' }, at('14:00'))?.label).toBe('Asr')
  })

  it('formats a 12-hour clock when the device uses one', () => {
    expect(stripLine(MAKKAH, S, at('14:00'), true)?.time).toBe('3:54 PM')
  })

  it('rolls over to Fajr after Isha', () => {
    expect(stripLine(MAKKAH, S, at('22:00'))).toMatchObject({ label: 'Fajr', prayer: 'fajr' })
  })
})

describe('time zones', () => {
  const winter = Date.parse('2026-01-15T12:00:00Z')
  const summer = Date.parse('2026-07-15T12:00:00Z')

  it('measures a zone’s offset, with daylight saving', () => {
    expect(zoneOffsetMin('Asia/Riyadh', winter)).toBe(180)
    expect(zoneOffsetMin('Europe/London', winter)).toBe(0)
    expect(zoneOffsetMin('Europe/London', summer)).toBe(60)
    expect(zoneOffsetMin('America/New_York', winter)).toBe(-300)
    expect(zoneOffsetMin('Asia/Kolkata', winter)).toBe(330)
  })

  it('flags a phone on another clock, not one on a twin zone', () => {
    expect(zoneDiffers('Asia/Riyadh', 'Europe/London', winter)).toBe(true)
    expect(zoneDiffers('Europe/London', 'Europe/Dublin', winter)).toBe(false)
    expect(zoneDiffers('Asia/Riyadh', 'Asia/Riyadh', winter)).toBe(false)
    expect(zoneDiffers('Asia/Riyadh', '', winter)).toBe(false)
    expect(zoneDiffers('Asia/Riyadh', 'Not/AZone', winter)).toBe(false)
  })
})
