import { describe, expect, it } from 'vitest'
import { stripWanted } from '@/components/home/prayer-strip'
import { PLACE_STORE_KEY } from '@/stores/place-store'
import { PRAYER_STORE_KEY } from '@/stores/prayer-store'

const storage = (items: Record<string, unknown>) => ({
  getItem: (k: string) => (k in items ? (typeof items[k] === 'string' ? (items[k] as string) : JSON.stringify(items[k])) : null),
})
const PLACE = { state: { place: { lat: 21.42, lng: 39.83, label: 'Makkah', countryCode: 'SA', tz: 'Asia/Riyadh', source: 'city' } }, version: 1 }

describe('HomePrayerStrip: stripWanted', () => {
  it('reads the same keys the stores persist under', () => {
    expect(PLACE_STORE_KEY).toBe('takrar-place')
    expect(PRAYER_STORE_KEY).toBe('takrar-prayer')
  })

  it('shows nothing without a place', () => {
    expect(stripWanted(storage({}))).toBe(false)
    expect(stripWanted(storage({ 'takrar-place': { state: { place: null }, version: 1 } }))).toBe(false)
  })

  it('shows the strip once a place exists, unless it was turned off', () => {
    expect(stripWanted(storage({ 'takrar-place': PLACE }))).toBe(true)
    expect(stripWanted(storage({ 'takrar-place': PLACE, 'takrar-prayer': { state: { homeStrip: true }, version: 1 } }))).toBe(true)
    expect(stripWanted(storage({ 'takrar-place': PLACE, 'takrar-prayer': { state: { homeStrip: false }, version: 1 } }))).toBe(false)
  })

  it('treats unreadable storage as no place', () => {
    expect(stripWanted(storage({ 'takrar-place': '{not json' }))).toBe(false)
    expect(stripWanted({ getItem: () => { throw new Error('blocked') } })).toBe(false)
  })
})
