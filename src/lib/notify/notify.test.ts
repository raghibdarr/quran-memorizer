import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { LocalNotificationSchema } from '@capacitor/local-notifications'
import {
  IOS_PENDING_LIMIT,
  NOTIFY_RANGES,
  PRAYER_MAX_DAYS,
  PRAYER_SLOTS_PER_DAY,
  ANDROID_PRAYER_HORIZON_DAYS,
  budgetFor,
  iosPrayerDays,
  prayerAlertId,
  rangeOf,
} from './registry'
import { applyRange, forgetApplied, hashNotifications, type NotifyDeps } from './apply'
import { REMINDER_IDS } from '@/lib/reminders'

describe('ID registry', () => {
  it('ranges never overlap', () => {
    const ranges = Object.values(NOTIFY_RANGES).sort((a, b) => a.start - b.start)
    for (let i = 1; i < ranges.length; i++) expect(ranges[i].start).toBeGreaterThan(ranges[i - 1].end)
  })

  it('iOS slots add up to the 64 pending limit', () => {
    expect(Object.values(NOTIFY_RANGES).reduce((n, r) => n + r.iosSlots, 0)).toBe(IOS_PENDING_LIMIT)
  })

  it('the existing hifz reminders sit inside their range and budget', () => {
    for (const id of REMINDER_IDS) expect(rangeOf(id)?.name).toBe('hifz')
    expect(REMINDER_IDS.length).toBeLessThanOrEqual(20)
  })

  it('prayer ids are unique, stable and inside the range for every day and slot', () => {
    const seen = new Set<number>()
    for (let d = 0; d < PRAYER_MAX_DAYS; d++) {
      for (let s = 0; s < PRAYER_SLOTS_PER_DAY; s++) {
        const id = prayerAlertId(d, s)
        expect(rangeOf(id)?.name).toBe('prayer')
        expect(seen.has(id)).toBe(false)
        seen.add(id)
      }
    }
    expect(prayerAlertId(0, 0)).toBe(20000)
    expect(prayerAlertId(2, 3)).toBe(20043)
    expect(() => prayerAlertId(PRAYER_MAX_DAYS, 0)).toThrow(RangeError)
    expect(() => prayerAlertId(0, PRAYER_SLOTS_PER_DAY)).toThrow(RangeError)
  })

  it('Android holds 30 days; iOS as many days as fit in 48', () => {
    expect(ANDROID_PRAYER_HORIZON_DAYS * PRAYER_SLOTS_PER_DAY).toBeLessThanOrEqual(budgetFor(NOTIFY_RANGES.prayer, 'android'))
    expect(iosPrayerDays(5)).toBe(9)
    expect(iosPrayerDays(10)).toBe(4)
    expect(budgetFor(NOTIFY_RANGES.prayer, 'web')).toBe(0)
  })
})

function fakeDeps(platform: NotifyDeps['platform'] = 'android') {
  const pending = new Map<number, LocalNotificationSchema>()
  const store = new Map<string, string>()
  let schedules = 0
  const deps: NotifyDeps = {
    platform,
    getPending: async () => ({ notifications: [...pending.values()].map((n) => ({ id: n.id })) }),
    cancel: async ({ notifications }) => { for (const n of notifications) pending.delete(n.id) },
    schedule: async ({ notifications }) => { schedules++; for (const n of notifications) pending.set(n.id, n) },
    getHash: (k) => store.get(k) ?? null,
    setHash: (k, v) => { if (v === null) store.delete(k); else store.set(k, v) },
  }
  return { deps, pending, schedules: () => schedules }
}

const note = (id: number, at: number): LocalNotificationSchema => ({ id, title: 'Dhuhr · 12:41', body: '', schedule: { at: new Date(at) } })

describe('applyRange', () => {
  it('replaces only its own range and skips an unchanged set', async () => {
    const { deps, pending, schedules } = fakeDeps()
    pending.set(7100, note(7100, 1)) // a hifz reminder must survive
    pending.set(20005, note(20005, 1)) // a stale prayer alert must go
    const set = [note(20000, 1000), note(20001, 2000)]

    expect(await applyRange(NOTIFY_RANGES.prayer, set, deps)).toEqual({ status: 'applied', scheduled: 2, cancelled: 1, dropped: 0 })
    expect([...pending.keys()].sort((a, b) => a - b)).toEqual([7100, 20000, 20001])
    expect(await applyRange(NOTIFY_RANGES.prayer, [...set].reverse(), deps)).toEqual({ status: 'unchanged' })
    expect(schedules()).toBe(1)

    forgetApplied(NOTIFY_RANGES.prayer, deps)
    expect((await applyRange(NOTIFY_RANGES.prayer, set, deps)).status).toBe('applied')
  })

  it('an empty set clears the range', async () => {
    const { deps, pending } = fakeDeps()
    await applyRange(NOTIFY_RANGES.adhkar, [note(22000, 5)], deps)
    await applyRange(NOTIFY_RANGES.adhkar, [], deps)
    expect(pending.size).toBe(0)
  })

  it('refuses ids outside the range', async () => {
    const { deps } = fakeDeps()
    await expect(applyRange(NOTIFY_RANGES.prayer, [note(7100, 1)], deps)).rejects.toThrow(RangeError)
  })

  it('iOS keeps the earliest alerts within the budget', async () => {
    const { deps, pending } = fakeDeps('ios')
    const set = Array.from({ length: 60 }, (_, i) => note(20000 + i, 10_000 - i))
    const r = await applyRange(NOTIFY_RANGES.prayer, set, deps)
    expect(r).toMatchObject({ scheduled: 48, dropped: 12 })
    const earliest = set.map((n) => n.id).slice(-48)
    expect([...pending.keys()].sort((a, b) => a - b)).toEqual(earliest.sort((a, b) => a - b))
  })

  it('does nothing on the web', async () => {
    const { deps, schedules } = fakeDeps('web')
    expect(await applyRange(NOTIFY_RANGES.prayer, [note(20000, 1)], deps)).toEqual({ status: 'unsupported' })
    expect(schedules()).toBe(0)
  })

  it('hash: order-independent, sensitive to any change', () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.integer({ min: 20000, max: 20999 }), { minLength: 1, maxLength: 20 }),
      fc.integer({ min: 1, max: 1e12 }),
      (ids, at) => {
        const set = ids.map((id) => note(id, at + id))
        expect(hashNotifications([...set].reverse())).toBe(hashNotifications(set))
        const moved = set.map((n, i) => (i === 0 ? note(n.id, at + n.id + 60_000) : n))
        expect(hashNotifications(moved)).not.toBe(hashNotifications(set))
      },
    ))
  })
})
