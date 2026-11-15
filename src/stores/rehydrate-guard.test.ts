// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

// A same-version value of the wrong shape must come back as defaults on
// rehydrate (not only on a version change): a newer build's method id, a
// partial write, or an action bug must never crash the screens that read it.

const mem = new Map<string, string>()
beforeAll(() => {
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  } as Storage
  // zustand's default storage reads window.localStorage
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage })
})

const put = (key: string, state: unknown, version: number) => mem.set(key, JSON.stringify({ state, version }))

describe('stores sanitize every rehydrate', () => {
  it('prayer: an unknown method and an out-of-range Hijri offset fall back', async () => {
    const { usePrayerStore, PRAYER_STORE_KEY, PRAYER_STORE_VERSION, defaultPrayerData } = await import('./prayer-store')
    put(PRAYER_STORE_KEY, { method: 'NotAMethod', hijriOffset: 99, alerts: 'nope', offsets: [1, 2] }, PRAYER_STORE_VERSION)
    await usePrayerStore.persist.rehydrate()
    const s = usePrayerStore.getState()
    expect(s.method).toBe(defaultPrayerData().method)
    expect(s.hijriOffset).toBe(2)
    expect(typeof s.alerts.fajr.mode).toBe('string')
    expect(typeof s.setMethod).toBe('function')
  })

  it('worship: pauses as an object become an empty list', async () => {
    const { useWorshipStore, WORSHIP_STORE_KEY, WORSHIP_STORE_VERSION } = await import('./worship-store')
    put(WORSHIP_STORE_KEY, { pauses: { a: 1 }, prayers: 'x', fasts: null, madeUp: 7 }, WORSHIP_STORE_VERSION)
    await useWorshipStore.persist.rehydrate()
    const s = useWorshipStore.getState()
    expect(Array.isArray(s.pauses)).toBe(true)
    expect(s.pauses).toEqual([])
    expect(s.madeUp).toEqual({ prayers: 0, fasts: 0 })
  })

  it('zakat: garbage inputs become defaults', async () => {
    const { useZakatStore, ZAKAT_STORE_KEY, ZAKAT_STORE_VERSION, sanitizeZakatData } = await import('./zakat-store')
    put(ZAKAT_STORE_KEY, { inputs: 'x', nisabBasis: 'platinum', pricePerGram: -1 }, ZAKAT_STORE_VERSION)
    await useZakatStore.persist.rehydrate()
    const s = useZakatStore.getState()
    expect(s.nisabBasis).toBe(sanitizeZakatData({}).nisabBasis)
    expect(typeof s.inputs).toBe('object')
  })

  it('place: a place without a valid zone is dropped', async () => {
    const { usePlaceStore, PLACE_STORE_KEY, PLACE_STORE_VERSION } = await import('./place-store')
    put(PLACE_STORE_KEY, { place: { lat: 'north', lng: 2, tz: 'Mars/Base' } }, PLACE_STORE_VERSION)
    await usePlaceStore.persist.rehydrate()
    expect(usePlaceStore.getState().place).toBeNull()
  })

  it('deen: cards without a deck are dropped and newPerDay is clamped', async () => {
    const { useDeenStore, DEEN_STORE_KEY, DEEN_STORE_VERSION } = await import('./deen-store')
    put(DEEN_STORE_KEY, { cards: { a: 1, 'x:1:meaning': { deck: 'x' } }, newPerDay: 1e9, introduced: [] }, DEEN_STORE_VERSION)
    await useDeenStore.persist.rehydrate()
    const s = useDeenStore.getState()
    expect(Object.keys(s.cards)).toEqual(['x:1:meaning'])
    expect(s.newPerDay).toBe(50)
    expect(s.introduced).toEqual({})
  })
})
