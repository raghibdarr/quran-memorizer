import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, LocalNotificationSchema } from '@capacitor/local-notifications'
import { PRAYER_NAMES, type AlertMode, type Place, type PrayerAlert, type PrayerName } from '@/types/prayer'

// A mocked LocalNotifications: an in-memory OS that records every call
const os = vi.hoisted(() => {
  const state = {
    platform: 'android' as 'android' | 'ios' | 'web',
    pending: new Map<number, unknown>(),
    channels: [] as unknown[],
    cancelled: [] as number[],
    scheduleCalls: 0,
    display: 'granted',
    exact: 'granted',
    changeExactCalls: 0,
  }
  const plugin = {
    getPending: async () => ({ notifications: [...state.pending.values()] }),
    cancel: async ({ notifications }: { notifications: { id: number }[] }) => {
      for (const n of notifications) {
        state.cancelled.push(n.id)
        state.pending.delete(n.id)
      }
    },
    schedule: async ({ notifications }: { notifications: { id: number }[] }) => {
      state.scheduleCalls++
      for (const n of notifications) state.pending.set(n.id, n)
      return { notifications: notifications.map((n) => ({ id: n.id })) }
    },
    createChannel: async (c: unknown) => {
      state.channels.push(c)
    },
    checkPermissions: async () => ({ display: state.display }),
    requestPermissions: async () => ({ display: state.display === 'prompt' ? 'granted' : state.display }),
    checkExactNotificationSetting: async () => ({ exact_alarm: state.exact }),
    changeExactNotificationSetting: async () => {
      state.changeExactCalls++
      return { exact_alarm: state.exact }
    },
  }
  return { state, plugin }
})

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: os.plugin }))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => os.state.platform,
    isNativePlatform: () => os.state.platform !== 'web',
    isPluginAvailable: () => false,
  },
  registerPlugin: () => ({}),
}))

import { REMINDER_IDS } from '@/lib/reminders'
import { planPrayerAlerts, type AlertSettings } from './schedule'
import {
  ALERT_META_KEY,
  PRAYER_CHANNELS,
  alertPermission,
  clearPrayerAlerts,
  exactAlarmState,
  openExactAlarmSetting,
  pendingPrayerAlerts,
  readAlertMeta,
  requestAlertPermission,
  resetPrayerChannels,
  sendTestAlert,
  soundFields,
  syncPrayerAlerts,
} from './notifications'

const LONDON: Place = { lat: 51.51, lng: -0.13, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'city' }
const NOW = Date.parse('2026-11-13T09:00:00Z')

const alertsAll = (mode: AlertMode, preAlertMin = 0) =>
  Object.fromEntries(PRAYER_NAMES.map((p) => [p, { mode, preAlertMin }])) as Record<PrayerName, PrayerAlert>
const settings = (alerts: Record<PrayerName, PrayerAlert>): AlertSettings => ({
  method: 'MuslimWorldLeague',
  madhab: 'standard',
  highLatRule: 'auto',
  offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  alerts,
})
const planFor = (alerts = alertsAll('default', 10), now = NOW) =>
  planPrayerAlerts({ now, place: LONDON, settings: settings(alerts), platform: os.state.platform })

const pendingOf = () => [...os.state.pending.values()] as LocalNotificationSchema[]
const pendingIds = () => [...os.state.pending.keys()].sort((a, b) => a - b)
const stub = (id: number): LocalNotificationSchema => ({ id, title: 'x', body: 'y', schedule: { at: new Date(NOW + 3600_000) } })

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  Object.assign(os.state, {
    platform: 'android',
    pending: new Map(),
    channels: [],
    cancelled: [],
    scheduleCalls: 0,
    display: 'granted',
    exact: 'granted',
    changeExactCalls: 0,
  })
  resetPrayerChannels()
})
afterEach(() => vi.unstubAllGlobals())

describe('syncPrayerAlerts (Android)', () => {
  it('cancels only inside 20000-21000: hifz reminders and other ranges survive', async () => {
    const outside = [...REMINDER_IDS, 19999, 21001, 22000, 22100]
    for (const id of [...outside, 20005, 20999, 21000]) os.state.pending.set(id, stub(id))

    const r = await syncPrayerAlerts(planFor())
    expect(r.alerts.status).toBe('applied')
    expect(os.state.cancelled.length).toBeGreaterThan(0)
    expect(os.state.cancelled.every((id) => id >= 20000 && id <= 21000)).toBe(true)
    for (const id of outside) expect(os.state.pending.has(id)).toBe(true)
    // The stale prayer alert went; the new plan and its tail are in
    expect(pendingOf().find((n) => n.id === 20999)).toBeUndefined()
    expect(os.state.pending.has(21000)).toBe(true)
  })

  it('opening again with the same plan does not touch the alarms', async () => {
    const plan = planFor()
    await syncPrayerAlerts(plan)
    const calls = os.state.scheduleCalls
    const cancelled = os.state.cancelled.length
    const again = await syncPrayerAlerts(plan)
    expect(again).toEqual({ alerts: { status: 'unchanged' }, tail: { status: 'unchanged' } })
    expect(os.state.scheduleCalls).toBe(calls)
    expect(os.state.cancelled.length).toBe(cancelled)
  })

  it('creates the three channels once, the chime with its sound', async () => {
    await syncPrayerAlerts(planFor())
    await syncPrayerAlerts(planFor(alertsAll('silent')))
    const channels = os.state.channels as Channel[]
    expect(channels.map((c) => c.id).sort()).toEqual(['prayer-chime-v1', 'prayer-default-v1', 'prayer-silent-v1'])
    expect(channels.find((c) => c.id === PRAYER_CHANNELS.chime)!.sound).toBe('takrar_chime.wav')
    expect(channels.find((c) => c.id === PRAYER_CHANNELS.silent)!.importance).toBeLessThan(3)
  })

  it('routes each mode to its channel and carries the tap url', async () => {
    await syncPrayerAlerts(planFor({ fajr: { mode: 'default', preAlertMin: 0 }, dhuhr: { mode: 'chime', preAlertMin: 0 }, asr: { mode: 'silent', preAlertMin: 0 }, maghrib: { mode: 'off', preAlertMin: 0 }, isha: { mode: 'off', preAlertMin: 0 } }))
    const byBody = (prefix: string) => pendingOf().filter((n) => n.body.startsWith(prefix) && n.id < 21000)
    expect(byBody('Fajr').every((n) => n.channelId === 'prayer-default-v1')).toBe(true)
    expect(byBody('Dhuhr').every((n) => n.channelId === 'prayer-chime-v1')).toBe(true)
    expect(byBody('Asr').every((n) => n.channelId === 'prayer-silent-v1')).toBe(true)
    expect(byBody('Maghrib')).toHaveLength(0)
    expect(pendingOf().every((n) => n.extra?.url === '/prayer')).toBe(true)
    // The tail rings with the last alert, so it is quiet
    expect(pendingOf().find((n) => n.id === 21000)!.channelId).toBe('prayer-silent-v1')
  })

  it('schedules exactly only with the grant, and never opens settings by itself', async () => {
    await syncPrayerAlerts(planFor())
    expect(pendingOf().filter((n) => n.id >= 20000 && n.id <= 21000).every((n) => n.isExactNotification === true)).toBe(true)

    os.state.exact = 'denied'
    const r = await syncPrayerAlerts(planFor())
    // The exactness changed, so the set changed: rescheduled inexactly
    expect(r.alerts.status).toBe('applied')
    expect(pendingOf().filter((n) => n.id >= 20000 && n.id <= 21000).every((n) => n.isExactNotification === false)).toBe(true)
    expect(pendingOf().every((n) => n.schedule?.allowWhileIdle !== false)).toBe(true)
    expect(os.state.changeExactCalls).toBe(0)
  })

  it('an empty plan clears the prayer range and the tail', async () => {
    os.state.pending.set(7100, stub(7100))
    await syncPrayerAlerts(planFor())
    expect(readAlertMeta()).not.toBeNull()
    await syncPrayerAlerts(planFor(alertsAll('off')))
    expect(pendingIds()).toEqual([7100])
    expect(localStorage.getItem(ALERT_META_KEY)).toBeNull()
  })

  it('clearPrayerAlerts makes no OS call for someone who never had alerts', async () => {
    const spy = vi.spyOn(os.plugin, 'getPending')
    expect(await clearPrayerAlerts()).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    await syncPrayerAlerts(planFor())
    expect(await clearPrayerAlerts()).toBe(true)
    expect(pendingIds()).toEqual([])
    spy.mockRestore()
  })

  it('reports pending prayer alerts, leaving out the tail and a test alert', async () => {
    const plan = planFor()
    await syncPrayerAlerts(plan)
    expect(await sendTestAlert('chime', undefined, NOW)).toBe(true)
    const test = pendingOf().find((n) => n.title === 'Test alert')!
    expect(test.id).toBe(20019)
    expect(new Date(test.schedule!.at!).getTime()).toBe(NOW + 10_000)
    expect(test.channelId).toBe('prayer-chime-v1')
    expect(plan.alerts.some((a) => a.id === 20019)).toBe(false)
    const summary = await pendingPrayerAlerts()
    expect(summary.count).toBe(plan.alerts.length)
    expect(summary.lastAt).toBe(plan.alerts[plan.alerts.length - 1].at)
    expect(readAlertMeta()).toMatchObject({ count: plan.alerts.length, lastAt: summary.lastAt })
  })

  it('reads permission and exact-alarm state; the exact setting opens on request only', async () => {
    expect(await alertPermission()).toBe('granted')
    os.state.display = 'prompt'
    expect(await alertPermission()).toBe('prompt')
    expect(await requestAlertPermission()).toBe(true)
    os.state.display = 'denied'
    expect(await alertPermission()).toBe('denied')
    expect(await requestAlertPermission()).toBe(false)
    os.state.exact = 'denied'
    expect(await exactAlarmState()).toBe('denied')
    expect(await openExactAlarmSetting()).toBe(true)
    expect(os.state.changeExactCalls).toBe(1)
  })
})

describe('syncPrayerAlerts (iOS and web)', () => {
  it('iOS: within 48 alerts plus the tail, no channels, no chime, no exact flag', async () => {
    os.state.platform = 'ios'
    const plan = planFor(alertsAll('chime', 10))
    await syncPrayerAlerts(plan)
    const prayer = pendingOf().filter((n) => n.id >= 20000 && n.id < 21000)
    expect(prayer.length).toBeLessThanOrEqual(48)
    expect(prayer.length).toBe(plan.alerts.length)
    expect(os.state.pending.has(21000)).toBe(true)
    expect(os.state.channels).toHaveLength(0)
    for (const n of prayer) {
      expect(n.channelId).toBeUndefined()
      expect(n.isExactNotification).toBeUndefined()
      expect(n.sound).toBe('default')
    }
    expect(pendingOf().find((n) => n.id === 21000)!.sound).toBeUndefined()
    expect(await exactAlarmState()).toBe('unsupported')
  })

  it('maps sounds per platform', () => {
    expect(soundFields('silent', 'ios')).toEqual({})
    expect(soundFields('default', 'ios')).toEqual({ sound: 'default' })
    expect(soundFields('chime', 'ios')).toEqual({ sound: 'default' })
    expect(soundFields('chime', 'android')).toEqual({ channelId: 'prayer-chime-v1' })
  })

  it('web: nothing at all', async () => {
    os.state.platform = 'web'
    const spy = vi.spyOn(os.plugin, 'schedule')
    expect(await syncPrayerAlerts(planFor())).toEqual({ alerts: { status: 'unsupported' }, tail: { status: 'unsupported' } })
    expect(await sendTestAlert('default')).toBe(false)
    expect(await alertPermission()).toBe('unsupported')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
