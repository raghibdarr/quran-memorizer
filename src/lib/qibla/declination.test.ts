import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { declinationAt, decimalYear, magneticField } from './declination'
import { WMM_COEFFICIENTS, WMM_EPOCH } from './wmm2025'

const dir = path.resolve(__dirname, '../../../data-sources/wmm')
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8')

/** Rows of a NOAA test-value file, comments dropped */
const rows = (text: string) =>
  text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).map(Number))

describe('WMM2025 coefficients', () => {
  it('the generated module matches the pinned NOAA file exactly', () => {
    const lines = read('WMM2025.COF').split(/\r?\n/).filter((l) => l.trim())
    expect(lines[0].trim().split(/\s+/).slice(0, 2)).toEqual(['2025.0', 'WMM-2025'])
    const cof = lines.slice(1).filter((l) => !/^9{10,}/.test(l.trim())).map((l) => l.trim().split(/\s+/).map((v) => Number(v) + 0)) // the file writes 0 as -0.0
    expect(cof).toHaveLength(90) // n = 1..12
    expect(WMM_COEFFICIENTS.map((r) => [...r])).toEqual(cof)
    expect(WMM_EPOCH).toBe(2025)
  })
})

describe('magneticField: NOAA WMM2025 test values', () => {
  // 100 points over 2025-2029.5, sea level to 100 km (WMM2025COF.zip)
  const official = rows(read('WMM2025_TestValues.txt'))
  it.each(official.map((r) => [r[0], r[1], r[2], r[3], r[4], r[6]]))(
    '%s alt %s km, %s, %s: D %s, H %s',
    (year, alt, lat, lng, decl, h) => {
      const f = magneticField(lat, lng, year, alt)
      // The file gives D to 0.01 degree; the app needs well under 1 degree
      expect(Math.abs(f.declination - decl)).toBeLessThan(0.02)
      expect(Math.abs(f.h - h)).toBeLessThan(0.5)
    },
  )

  // The 12 values on the WMM page (WMM2025_TEST_VALUES.txt, one decimal)
  const web = rows(read('WMM2025_TEST_VALUES_web.txt'))
  it.each(web.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[10]]))(
    'web %s alt %s km, %s, %s',
    (year, alt, lat, lng, x, y, z, decl) => {
      const f = magneticField(lat, lng, year, alt)
      expect(Math.abs(f.declination - decl)).toBeLessThan(0.02)
      expect(Math.abs(f.x - x)).toBeLessThan(0.2)
      expect(Math.abs(f.y - y)).toBeLessThan(0.2)
      expect(Math.abs(f.z - z)).toBeLessThan(0.2)
    },
  )
})

describe('declinationAt', () => {
  it('London in 2026 is close to zero, Seattle about 15 east', () => {
    const now = new Date('2026-11-13T12:00:00Z')
    const london = declinationAt(51.51, -0.13, now)
    expect(london.ok && Math.abs(london.degrees)).toBeLessThan(2)
    const seattle = declinationAt(47.61, -122.33, now)
    expect(seattle.ok && seattle.degrees).toBeGreaterThan(13)
    expect(seattle.ok && seattle.degrees).toBeLessThan(17)
  })

  it('flags the weak field near the magnetic pole', () => {
    const r = declinationAt(85, -140, new Date('2026-06-01T00:00:00Z'))
    expect(r.ok && r.weakField).toBe(true)
    const london = declinationAt(51.51, -0.13, new Date('2026-06-01T00:00:00Z'))
    expect(london.ok && london.weakField).toBe(false)
  })

  it('stops once the model is well past its life, rather than guess', () => {
    expect(declinationAt(51.5, 0, new Date('2031-06-01T00:00:00Z')).ok).toBe(true)
    expect(declinationAt(51.5, 0, new Date('2033-01-01T00:00:00Z'))).toEqual({ ok: false, reason: 'expired' })
  })

  it('decimalYear', () => {
    expect(decimalYear(new Date('2025-01-01T00:00:00Z'))).toBe(2025)
    expect(decimalYear(new Date('2026-07-02T12:00:00Z'))).toBeCloseTo(2026.5, 2)
  })
})
