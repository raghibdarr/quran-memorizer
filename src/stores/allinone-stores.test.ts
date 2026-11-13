// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { migratePlace, sanitizePlace, PLACE_STORE_KEY } from './place-store'
import { calcSettingsOf, defaultPrayerData, migratePrayer, sanitizePrayerData, usePrayerStore } from './prayer-store'
import { defaultWorshipData, migrateWorship, sanitizeWorshipData, useWorshipStore } from './worship-store'
import { defaultZakatData, migrateZakat, sanitizeZakatData, useZakatStore } from './zakat-store'
import { defaultDeenData, migrateDeen, sanitizeDeenData, useDeenStore } from './deen-store'
import { newDeenCard } from '@/lib/deen/cards'

// The all-in-one stores (spec 3.2): each sanitizes whatever it's handed (a stale
// persisted shape, an imported backup), idempotently, and its actions keep it valid.

describe('place store', () => {
  it('rounds coordinates to 2 dp and rejects unusable places', () => {
    expect(sanitizePlace({ lat: 51.50735, lng: -0.12776, label: 'London', countryCode: 'gb', tz: 'Europe/London', source: 'gps' }))
      .toEqual({ lat: 51.51, lng: -0.13, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'gps' })
    expect(sanitizePlace({ lat: 91, lng: 0, tz: 'UTC' })).toBeNull()
    expect(sanitizePlace({ lat: 10, lng: 10 })).toBeNull() // no zone, no times
    expect(sanitizePlace({ lat: NaN, lng: 0, tz: 'UTC' })).toBeNull()
    // A zone the device can't format in would throw on every screen that shows a time
    expect(sanitizePlace({ lat: 10, lng: 10, tz: 'Not/AZone' })).toBeNull()
    expect(sanitizePlace({ lat: 10, lng: 10, tz: 'Pacific/Tongatapu' })?.tz).toBe('Pacific/Tongatapu')
    expect(migratePlace({ place: { lat: 1.234, lng: 2.345, tz: 'UTC', label: 'x' } }, 0).place).toMatchObject({ lat: 1.23, lng: 2.35, source: 'city' })
    expect(migratePlace(undefined, 0)).toEqual({ place: null })
    expect(PLACE_STORE_KEY).toBe('takrar-place')
  })
})

describe('prayer store', () => {
  it('defaults: MWL, standard Asr, auto high-latitude, everything off', () => {
    const d = defaultPrayerData()
    expect(d).toMatchObject({ method: 'MuslimWorldLeague', madhab: 'standard', highLatRule: 'auto', hijriOffset: 0, homeStrip: true, ramadanMode: 'auto', setupDone: false })
    expect(Object.values(d.alerts).every((a) => a.mode === 'off')).toBe(true)
  })

  it('sanitize repairs anything and is idempotent', () => {
    fc.assert(fc.property(fc.anything(), (raw) => {
      const once = sanitizePrayerData(raw)
      expect(sanitizePrayerData(once)).toEqual(once)
    }))
    expect(sanitizePrayerData({ method: 'Nope', hijriOffset: 7, offsets: { fajr: 500 }, alerts: { fajr: { mode: 'adhan' } } }))
      .toMatchObject({ method: 'MuslimWorldLeague', hijriOffset: 2, offsets: { fajr: 60 }, alerts: { fajr: { mode: 'default' } } })
    expect(migratePrayer(defaultPrayerData(), 1)).toEqual(defaultPrayerData())
  })

  it('applyCalc remembers the previous calculation and undoCalc restores it', () => {
    const s = usePrayerStore.getState()
    s.setMethod('Karachi')
    s.setMadhab('hanafi')
    s.applyCalc({ method: 'custom', madhab: 'standard', highLatRule: 'seventhofthenight', offsets: { fajr: 3, sunrise: 0, dhuhr: 1, asr: 0, maghrib: 2, isha: -4 }, customAngles: { fajr: 16.5, isha: 15 } })
    expect(calcSettingsOf(usePrayerStore.getState())).toMatchObject({ method: 'custom', customAngles: { fajr: 16.5, isha: 15 } })
    expect(usePrayerStore.getState().previous).toMatchObject({ method: 'Karachi', madhab: 'hanafi' })
    usePrayerStore.getState().undoCalc()
    const after = usePrayerStore.getState()
    expect(calcSettingsOf(after)).toEqual({ method: 'Karachi', madhab: 'hanafi', highLatRule: 'auto', offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 } })
    expect(after.previous).toBeUndefined()
  })

  it('clamps offsets and the Hijri offset', () => {
    const s = usePrayerStore.getState()
    s.setOffset('isha', 999)
    s.setHijriOffset(-5)
    s.setAlert('asr', { mode: 'chime', preAlertMin: 15 })
    const st = usePrayerStore.getState()
    expect(st.offsets.isha).toBe(60)
    expect(st.hijriOffset).toBe(-2)
    expect(st.alerts.asr).toEqual({ mode: 'chime', preAlertMin: 15 })
  })
})

describe('worship store', () => {
  it('logs and clears prayers and fasts; pauses open and close', () => {
    const s = useWorshipStore.getState()
    s.markPrayer('2026-07-10', 'fajr', 'ontime', 1)
    s.markPrayer('2026-07-10', 'isha', 'late', 2)
    s.clearPrayer('2026-07-10', 'fajr')
    s.markFast('2026-07-10', 'fasted', 3)
    s.addMadeUp('prayers', 2)
    s.addMadeUp('prayers', -5)
    const id = s.startPause('2026-07-11')
    useWorshipStore.getState().endPause(id, '2026-07-14')
    s.addTasbih('dhikr-1', 33)
    const st = useWorshipStore.getState()
    expect(st.prayers).toEqual({ '2026-07-10': { isha: { s: 'late', at: 2 } } })
    expect(st.fasts['2026-07-10']).toEqual({ s: 'fasted', at: 3 })
    expect(st.madeUp.prayers).toBe(0)
    expect(st.pauses).toEqual([{ id, from: '2026-07-11', to: '2026-07-14' }])
    expect(st.tasbihTotals['dhikr-1']).toBe(33)
  })

  it('sanitize drops bad days and marks, idempotently', () => {
    expect(sanitizeWorshipData({ prayers: { 'not-a-day': { fajr: { s: 'ontime' } }, '2026-07-10': { fajr: { s: 'skipped' }, asr: { s: 'late', at: 9 } } } }).prayers)
      .toEqual({ '2026-07-10': { asr: { s: 'late', at: 9 } } })
    fc.assert(fc.property(fc.anything(), (raw) => {
      const once = sanitizeWorshipData(raw)
      expect(sanitizeWorshipData(once)).toEqual(once)
    }))
    expect(migrateWorship(undefined, 0)).toEqual(defaultWorshipData())
  })
})

describe('zakat store', () => {
  it('keeps amounts, drops bad ones', () => {
    const s = useZakatStore.getState()
    s.setInput('cash', 1500)
    s.setInput('goldGrams', -3)
    s.setPrice('silver', 0.68)
    s.setHawlStart('2026-02-30x')
    const st = useZakatStore.getState()
    expect(st.inputs).toEqual({ cash: 1500 })
    expect(st.pricePerGram).toEqual({ gold: null, silver: 0.68 })
    expect(st.hawlStartIso).toBeNull()
    fc.assert(fc.property(fc.anything(), (raw) => {
      const once = sanitizeZakatData(raw)
      expect(sanitizeZakatData(once)).toEqual(once)
    }))
    expect(migrateZakat(null, 0)).toEqual(defaultZakatData())
  })
})

describe('deen store', () => {
  it('adds cards without overwriting, reviews through SM-2, caps the introduced log', () => {
    const s = useDeenStore.getState()
    s.addCards({ 'nawawi40:01:meaning': newDeenCard('nawawi40', 1, 10) })
    s.reviewCard('nawawi40:01:meaning', 5)
    s.addCards({ 'nawawi40:01:meaning': newDeenCard('nawawi40', 9, 10) })
    const card = useDeenStore.getState().cards['nawawi40:01:meaning']
    expect(card.repetitions).toBe(1)
    expect(card.itemRev).toBe(1)
    for (let d = 1; d <= 20; d++) useDeenStore.getState().noteIntroduced(`2026-07-${String(d).padStart(2, '0')}`, 2)
    expect(Object.keys(useDeenStore.getState().introduced)).toHaveLength(14)
    s.markLessonDone('w-01', 5)
    s.markLessonDone('w-01', 9)
    expect(useDeenStore.getState().lessonsDone['w-01']).toBe(5)
    s.setSuspended('nawawi40:01:meaning', true)
    expect(useDeenStore.getState().cards['nawawi40:01:meaning'].suspended).toBe(true)
  })

  it('sanitize is idempotent and migrate starts clean', () => {
    fc.assert(fc.property(fc.anything(), (raw) => {
      const once = sanitizeDeenData(raw)
      expect(sanitizeDeenData(once)).toEqual(once)
    }))
    expect(migrateDeen(undefined, 0)).toEqual(defaultDeenData())
    expect(sanitizeDeenData({ school: 'zahiri', newPerDay: 500 })).toMatchObject({ school: null, newPerDay: 50 })
  })
})
