import { describe, expect, it } from 'vitest'
import { qiblaBearing } from '@/lib/prayer/engine'
import { roundCoord } from '@/lib/location'
import { angleDiff } from './compass'
import { toTrueHeading, turnToQibla } from './heading'

// Published qibla bearings (degrees clockwise from true north), as listed in
// adhan's own test suite (batoulapps/adhan, QiblaTest), which in turn match the
// great-circle bearing to the Kaaba (21.4225241 N, 39.8261818 E).
const PUBLISHED: Array<[string, number, number, number]> = [
  ['Washington DC', 38.9072, -77.0369, 56.56],
  ['New York', 40.7128, -74.0059, 58.481],
  ['San Francisco', 37.7749, -122.4194, 18.843],
  ['Anchorage', 61.2181, -149.9003, 350.883],
  ['Sydney', -33.8688, 151.2093, 277.4996],
  ['Auckland', -36.8485, 174.7633, 261.197],
  ['London', 51.5074, -0.1278, 118.987],
  ['Paris', 48.8566, 2.3522, 119.163],
  ['Oslo', 59.9139, 10.7522, 139.027],
  ['Islamabad', 33.7294, 73.0931, 255.882],
  ['Tokyo', 35.6895, 139.6917, 293.021],
]

/** An independent great-circle initial bearing, for a cross-check */
function greatCircle(lat: number, lng: number): number {
  const r = Math.PI / 180
  const [p1, p2, dl] = [lat * r, 21.4225241 * r, (39.8261818 - lng) * r]
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return ((Math.atan2(y, x) / r) % 360 + 360) % 360
}

describe('qibla bearing: published values within 0.5 degrees', () => {
  it.each(PUBLISHED)('%s', (_name, lat, lng, published) => {
    expect(Math.abs(angleDiff(qiblaBearing({ lat, lng }), published))).toBeLessThan(0.5)
    // The app stores places rounded to 2 decimals (about 1 km): still within 0.5
    expect(Math.abs(angleDiff(qiblaBearing({ lat: roundCoord(lat), lng: roundCoord(lng) }), published))).toBeLessThan(0.5)
    expect(Math.abs(angleDiff(greatCircle(lat, lng), published))).toBeLessThan(0.5)
  })
})

describe('heading helpers', () => {
  it('iOS true headings pass through; Android magnetic ones get the declination', () => {
    expect(toTrueHeading({ heading: 100, reference: 'true' }, { ok: true, degrees: 15, weakField: false })).toEqual({ heading: 100, reference: 'true' })
    expect(toTrueHeading({ heading: 350, reference: 'magnetic' }, { ok: true, degrees: 15, weakField: false })).toEqual({ heading: 5, reference: 'true' })
    expect(toTrueHeading({ heading: 10, reference: 'magnetic' }, { ok: true, degrees: -15, weakField: false })).toEqual({ heading: 355, reference: 'true' })
    expect(toTrueHeading({ heading: 10, reference: 'magnetic' }, { ok: false, reason: 'expired' })).toEqual({ heading: 10, reference: 'magnetic' })
    expect(toTrueHeading({ heading: 10, reference: 'magnetic' }, null)).toEqual({ heading: 10, reference: 'magnetic' })
  })

  it('turnToQibla: positive means turn right, wrapping through north', () => {
    expect(turnToQibla(100, 119)).toBe(19)
    expect(turnToQibla(130, 119)).toBe(-11)
    expect(turnToQibla(350, 10)).toBe(20)
    expect(turnToQibla(10, 350)).toBe(-20)
  })
})
