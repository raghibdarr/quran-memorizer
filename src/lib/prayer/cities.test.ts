import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cityLabel,
  decodeCities,
  distanceKm,
  fold,
  knownZone,
  loadCities,
  nearestCity,
  placeFromCity,
  placeFromFix,
  regionName,
  resetCitiesForTests,
  searchCities,
  usableZone,
  type CitiesFile,
} from './cities'
import { sanitizePlace } from '@/stores/place-store'

const RAW = readFileSync(join(__dirname, '../../../public/data/cities.json'), 'utf8')
const FILE = JSON.parse(RAW) as CitiesFile
const index = decodeCities(FILE)
const names = (q: string, limit?: number) => searchCities(index, q, limit).map((c) => `${c.name}/${c.cc}`)

describe('US states', () => {
  it('names the state of every US row, so same-name towns can be told apart', () => {
    const us = index.cities.filter((c) => c.cc === 'US')
    expect(us.length).toBeGreaterThan(3000)
    for (const c of us) expect(regionName(c)).toMatch(/^[A-Z][a-z]+( (of )?[A-Z][a-z]+)*$/)
    const springfields = searchCities(index, 'Springfield', 8).filter((c) => c.cc === 'US').map(regionName)
    expect(springfields).toEqual(expect.arrayContaining(['Missouri', 'Illinois', 'Massachusetts']))
    expect(regionName(index.cities.find((c) => c.cc === 'GB')!)).toBe('')
  })

  it('refuses a file whose state codes do not add up', () => {
    expect(() => decodeCities({ ...FILE, admin1: { US: 'MO' } })).toThrow()
  })
})

describe('cities.json', () => {
  it('stays under the 350 KB gzip budget', () => {
    expect(gzipSync(RAW, { level: 9 }).length).toBeLessThan(350 * 1024)
  })

  it('decodes every row with a real position and a zone this platform knows', () => {
    expect(index.cities.length).toBeGreaterThan(30_000)
    for (const c of index.cities) {
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(c.lng)).toBeLessThanOrEqual(180)
      expect(c.cc).toMatch(/^[A-Z]{2}$/)
      expect(c.tier).toBeGreaterThanOrEqual(0)
      expect(c.tier).toBeLessThanOrEqual(9)
    }
  })

  it('gives every city a place the store accepts, even where this device lacks the zone name', () => {
    // One city per zone covers every zone name
    const perZone = new Map(index.cities.map((c) => [c.tz, c]))
    for (const c of perZone.values()) {
      const p = placeFromCity(c, index)
      expect(knownZone(p.tz), `${c.name}/${c.cc} ${c.tz}`).toBe(true)
      expect(sanitizePlace(p)).not.toBeNull()
    }
  })

  it('keeps only the licensed fields it needs (no ids, populations or alternate names)', () => {
    expect(Object.keys(FILE).sort()).toEqual(
      ['admin1', 'ascii', 'counts', 'countries', 'lat', 'licence', 'lng', 'name', 'pop', 'retrieved', 'source', 'v', 'z', 'zones'].sort(),
    )
    expect(Object.keys(FILE.admin1 ?? {})).toEqual(['US'])
    expect(FILE.licence).toContain('CC BY 4.0')
    expect(FILE.source).toContain('GeoNames')
  })

  it('places Makkah where it is', () => {
    const makkah = index.cities.find((c) => c.name === 'Makkah' && c.cc === 'SA')!
    expect(makkah.lat).toBeCloseTo(21.43, 2)
    expect(makkah.lng).toBeCloseTo(39.83, 2)
    expect(makkah.tz).toBe('Asia/Riyadh')
  })

  it('rejects a file of the wrong shape', () => {
    expect(() => decodeCities({ ...FILE, v: 2 })).toThrow()
    expect(() => decodeCities({ ...FILE, counts: FILE.counts.map((n, i) => (i === 0 ? n + 1 : n)) })).toThrow()
  })
})

describe('fold', () => {
  it('drops accents, unifies apostrophes and hyphens', () => {
    expect(fold('Sulţānah')).toBe('sultanah')
    expect(fold('Ta’if')).toBe("ta'if")
    expect(fold('  Saint-Étienne ')).toBe('saint etienne')
  })
})

describe('searchCities', () => {
  it('puts the exact, biggest match first', () => {
    expect(names('London')[0]).toBe('London/GB')
    expect(names('Makkah')[0]).toBe('Makkah/SA')
    expect(names('karachi')[0]).toBe('Karachi/PK')
  })

  it('finds prefixes as the user types', () => {
    expect(names('Lond')).toContain('London/GB')
    expect(names('ista')[0]).toBe('Istanbul/TR')
    expect(names('jak')[0]).toBe('Jakarta/ID')
  })

  it('ignores accents and case', () => {
    expect(names('SULTANAH')).toContain('Sulţānah/SA')
    expect(names('sao paulo')[0]).toBe('São Paulo/BR')
  })

  it('narrows by country after a comma, by name or code', () => {
    expect(names('London, Canada')[0]).toBe('London/CA')
    expect(names('london, ca')[0]).toBe('London/CA')
    expect(names('London Canada')[0]).toBe('London/CA')
    expect(names('Medina, United States')[0]).toBe('Medina/US')
  })

  it('knows the familiar English names of some places', () => {
    expect(names('Mecca')[0]).toBe('Makkah/SA')
    expect(names('medina')[0]).toBe('Madinah/SA')
    expect(names('Bombay')[0]).toBe('Mumbai/IN')
    expect(names('al-Quds')).toEqual(expect.arrayContaining(['Jerusalem/IL', 'East Jerusalem/PS']))
  })

  it('finds a later word of a name', () => {
    expect(names('jerusalem')).toContain('East Jerusalem/PS')
  })

  it('returns nothing for an empty or unmatched query and respects the limit', () => {
    expect(names('')).toEqual([])
    expect(names('   ')).toEqual([])
    expect(names('zzqqxx')).toEqual([])
    expect(names('san', 5)).toHaveLength(5)
  })
})

describe('nearestCity', () => {
  it('labels a rounded fix by the closest city', () => {
    const near = nearestCity(index, 21.42, 39.83)!
    expect(near.city.name).toBe('Makkah')
    expect(near.km).toBeLessThan(5)
  })

  it('finds the closest city for the far south and across the date line', () => {
    expect(nearestCity(index, -54.8, -68.3)!.city.name).toBe('Ushuaia')
    expect(nearestCity(index, -13.83, -171.76)!.city.cc).toBe('WS')
  })

  it('agrees with a brute-force search', () => {
    const points: Array<[number, number]> = [[51.5, -0.12], [40.7, -74], [-33.9, 151.2], [64.1, -21.9], [0, 0], [35.7, 139.7]]
    for (const [lat, lng] of points) {
      let best = Infinity
      for (const c of index.cities) best = Math.min(best, distanceKm(lat, lng, c.lat, c.lng))
      expect(nearestCity(index, lat, lng)!.km).toBeCloseTo(best, 6)
    }
  })
})

describe('places', () => {
  const makkah = () => index.cities.find((c) => c.name === 'Makkah' && c.cc === 'SA')!

  it('builds a valid city place', () => {
    const p = placeFromCity(makkah())
    expect(p).toEqual({ lat: 21.43, lng: 39.83, label: 'Makkah, Saudi Arabia', countryCode: 'SA', tz: 'Asia/Riyadh', source: 'city' })
    expect(sanitizePlace(p)).toEqual(p)
  })

  it('labels a fix by its nearest city, or "Near" it when further out', () => {
    expect(placeFromFix(21.42, 39.83, { city: makkah(), km: 2 }, 'Europe/London').label).toBe('Makkah, Saudi Arabia')
    const far = placeFromFix(21.6, 40.1, { city: makkah(), km: 40 }, 'Europe/London')
    expect(far).toMatchObject({ label: 'Near Makkah, Saudi Arabia', tz: 'Asia/Riyadh', countryCode: 'SA', source: 'gps', lat: 21.6, lng: 40.1 })
  })

  it('stands in the nearest known zone for one this device does not know', () => {
    const city = { ...makkah(), tz: 'Mars/Olympus_Mons' }
    expect(knownZone(city.tz)).toBe(false)
    expect(usableZone(index, city)).toBe('Asia/Riyadh')
    expect(usableZone(null, city)).toBe('Mars/Olympus_Mons')
  })

  it('falls back to the device zone without the list', () => {
    expect(placeFromFix(1, 2, null, 'Asia/Dubai')).toMatchObject({ label: 'Your location', tz: 'Asia/Dubai', countryCode: '' })
    expect(placeFromFix(1, 2, null, '').tz).toBe('UTC')
  })

  it('writes a country name the platform knows', () => {
    expect(cityLabel({ name: 'Paris', cc: 'FR' })).toBe('Paris, France')
    expect(cityLabel({ name: 'Singapore', cc: 'SG' })).toBe('Singapore')
  })
})

describe('loadCities', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetCitiesForTests()
  })

  it('fetches the bundled file once, from the app itself, with nothing about the user in the request', async () => {
    const fetchMock = vi.fn(async () => new Response(RAW, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([loadCities(), loadCities()])
    expect(a).toBe(b)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/data/cities.json')
  })

  it('tries again after a failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(RAW, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadCities()).rejects.toThrow()
    await expect(loadCities()).resolves.toHaveProperty('cities')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
