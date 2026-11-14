import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { signedAngle, solarCoordinates, sunAid, sunPosition } from './sun'
import { computeDay } from '@/lib/prayer/engine'

const ZERO = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
const angleGap = (a: number, b: number) => Math.abs(signedAngle(a, b))

describe('sunPosition: published reference values', () => {
  it('NREL Solar Position Algorithm test case (Reda and Andreas 2004)', () => {
    // 17 Oct 2003 12:30:30 local (UTC-7), Golden, Colorado: zenith 50.11162, azimuth 194.34024
    const s = sunPosition(Date.UTC(2003, 9, 17, 19, 30, 30), 39.742476, -105.1786)
    expect(angleGap(s.azimuth, 194.34024)).toBeLessThan(0.1)
    expect(Math.abs(90 - s.elevation - 50.11162)).toBeLessThan(0.1)
  })

  it('Meeus, Astronomical Algorithms, examples 25.a and 28.a (1992 Oct 13, 0h)', () => {
    const c = solarCoordinates(Date.UTC(1992, 9, 13, 0, 0, 0))
    expect(c.declination).toBeCloseTo(-7.78507, 2) // apparent declination -7°47'06"
    expect(Math.abs(c.equationOfTime - (13 + 42.6 / 60))).toBeLessThan(0.1) // E = 13m 42.6s
  })
})

describe('sunPosition: agrees with adhan and with geometry', () => {
  const cities = {
    london: { lat: 51.51, lng: -0.13, tz: 'Europe/London' },
    makkah: { lat: 21.42, lng: 39.83, tz: 'Asia/Riyadh' },
    jakarta: { lat: -6.21, lng: 106.85, tz: 'Asia/Jakarta' },
    sydney: { lat: -33.87, lng: 151.21, tz: 'Australia/Sydney' },
    newyork: { lat: 40.71, lng: -74.01, tz: 'America/New_York' },
  }
  const settings = { method: 'MuslimWorldLeague', madhab: 'standard', highLatRule: 'auto', offsets: ZERO } as const

  for (const [name, place] of Object.entries(cities)) {
    for (const iso of ['2026-03-15', '2026-06-21', '2026-12-21']) {
      it(`${name} ${iso}: at adhan's sunrise the sun is on the horizon; at Dhuhr it is due south or north`, () => {
        const day = computeDay(place, iso, settings)
        // adhan's sunrise: the upper limb on the horizon, i.e. the centre about a quarter degree below
        const rise = sunPosition(day.sunrise!, place.lat, place.lng)
        expect(Math.abs(rise.elevation - -0.27)).toBeLessThan(0.5)
        // Dhuhr is transit (adhan rounds to the minute): the sun is on the meridian
        const noon = sunPosition(day.dhuhr!, place.lat, place.lng)
        const zenithGap = Math.abs(place.lat - noon.declination)
        expect(Math.abs(noon.elevation - (90 - zenithGap))).toBeLessThan(0.3)
        // Azimuth swings fast when the sun passes near the zenith, so only check it when it doesn't
        if (zenithGap > 15) expect(angleGap(noon.azimuth, place.lat > noon.declination ? 180 : 0)).toBeLessThan(1.5)
      })
    }
  }

  it('at an equinox on the equator the sun rises due east and sets due west', () => {
    const morning = sunPosition(Date.UTC(2026, 2, 20, 7, 0, 0), 0, 0)
    expect(angleGap(morning.azimuth, 90)).toBeLessThan(1)
    const evening = sunPosition(Date.UTC(2026, 2, 20, 17, 0, 0), 0, 0)
    expect(angleGap(evening.azimuth, 270)).toBeLessThan(1)
  })

  it('never returns NaN, and stays in range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) }),
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        (ms, lat, lng) => {
          const s = sunPosition(ms, lat, lng)
          return s.azimuth >= 0 && s.azimuth < 360 && s.elevation >= -91 && s.elevation <= 91
        },
      ),
    )
  })
})

describe('sunAid', () => {
  it('left and right are as you face the qibla', () => {
    expect(sunAid(119, { azimuth: 154, elevation: 20 })).toEqual({ kind: 'side', side: 'right', degrees: 35 })
    expect(sunAid(119, { azimuth: 90, elevation: 20 })).toEqual({ kind: 'side', side: 'left', degrees: 29 })
  })

  it('wraps through north', () => {
    expect(sunAid(350, { azimuth: 10, elevation: 30 })).toEqual({ kind: 'side', side: 'right', degrees: 20 })
    expect(sunAid(10, { azimuth: 350, elevation: 30 })).toEqual({ kind: 'side', side: 'left', degrees: 20 })
  })

  it('straight ahead, behind, overhead and below the horizon', () => {
    expect(sunAid(119, { azimuth: 120, elevation: 30 })).toEqual({ kind: 'ahead' })
    expect(sunAid(119, { azimuth: 300, elevation: 30 })).toEqual({ kind: 'behind' })
    expect(sunAid(119, { azimuth: 200, elevation: 80 })).toEqual({ kind: 'overhead' })
    expect(sunAid(119, { azimuth: 200, elevation: -1 })).toEqual({ kind: 'below' })
  })
})
