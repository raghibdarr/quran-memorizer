import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The sync runner in a bare node env: a fake document and window, the OS glue mocked
const env = vi.hoisted(() => {
  const mem = new Map<string, string>()
  const g = globalThis as unknown as Record<string, unknown>
  g.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  }
  const doc = new EventTarget() as EventTarget & { hidden: boolean }
  doc.hidden = false
  g.document = doc
  // zustand's persist reads window.localStorage
  g.window = Object.assign(new EventTarget(), { localStorage: g.localStorage })
  return {
    doc,
    calls: { sync: 0, clear: 0, plans: [] as { alerts: unknown[] }[] },
    permission: 'granted' as string,
  }
})

vi.mock('@/lib/native', () => ({ isNative: () => true, nativePlatform: () => 'android' }))
vi.mock('@/lib/prayer/notifications', () => ({
  alertPermission: async () => env.permission,
  clearPrayerAlerts: async () => {
    env.calls.clear++
    return true
  },
  syncPrayerAlerts: async (plan: { alerts: unknown[] }) => {
    env.calls.sync++
    env.calls.plans.push(plan)
    return {}
  },
}))

import { usePlaceStore } from '@/stores/place-store'
import { usePrayerStore } from '@/stores/prayer-store'
import { RESYNC_EVENT, SYNCED_EVENT, startPrayerSync } from './sync-runner'

const LONDON = { lat: 51.5074, lng: -0.1278, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'city' as const }

/** Let the debounce fire and the replan's dynamic imports settle */
async function settle() {
  await vi.advanceTimersByTimeAsync(1600)
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await vi.advanceTimersByTimeAsync(10)
  await vi.waitFor(() => undefined)
}

let stop: () => void = () => {}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  env.calls.sync = 0
  env.calls.clear = 0
  env.calls.plans = []
  env.permission = 'granted'
  usePlaceStore.setState({ place: null })
  usePrayerStore.getState().setAllAlerts('off')
})
afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('startPrayerSync', () => {
  it('without a place only clears what was there, and never plans', async () => {
    stop = startPrayerSync()
    await settle()
    expect(env.calls.clear).toBe(1)
    expect(env.calls.sync).toBe(0)
  })

  it('plans once after a burst of changes, and ignores fields alerts do not use', async () => {
    usePlaceStore.getState().setPlace(LONDON)
    stop = startPrayerSync()
    usePrayerStore.getState().setAllAlerts('default')
    usePrayerStore.getState().setAlert('asr', { preAlertMin: 10 })
    await vi.waitFor(async () => {
      await settle()
      expect(env.calls.sync).toBe(1)
    })
    const plan = env.calls.plans[0] as { alerts: { prayer: string; kind: string }[] }
    expect(plan.alerts.some((a) => a.prayer === 'asr' && a.kind === 'pre')).toBe(true)

    usePrayerStore.getState().setHomeStrip(false)
    usePrayerStore.getState().setHijriOffset(1)
    await settle()
    expect(env.calls.sync).toBe(1)

    // Foreground return and an explicit request each replan (applyRange skips if unchanged)
    env.doc.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(async () => {
      await settle()
      expect(env.calls.sync).toBe(2)
    })
    window.dispatchEvent(new Event(RESYNC_EVENT))
    await vi.waitFor(async () => {
      await settle()
      expect(env.calls.sync).toBe(3)
    })
  })

  it('waits for permission, and clears when every prayer is turned off', async () => {
    usePlaceStore.getState().setPlace(LONDON)
    usePrayerStore.getState().setAllAlerts('silent')
    env.permission = 'prompt'
    stop = startPrayerSync()
    await settle()
    expect(env.calls.sync).toBe(0)

    usePrayerStore.getState().setAllAlerts('off')
    await vi.waitFor(async () => {
      await settle()
      expect(env.calls.clear).toBeGreaterThan(0)
    })
    expect(env.calls.sync).toBe(0)
  })

  it('says when a replan is done, so the health check can look again', async () => {
    let done = 0
    const onDone = () => void done++
    window.addEventListener(SYNCED_EVENT, onDone)
    stop = startPrayerSync()
    await settle()
    expect(done).toBe(1)
    window.dispatchEvent(new Event(RESYNC_EVENT))
    await settle()
    expect(done).toBe(2)
    window.removeEventListener(SYNCED_EVENT, onDone)
  })

  it('stops listening after cleanup', async () => {
    usePlaceStore.getState().setPlace(LONDON)
    usePrayerStore.getState().setAllAlerts('default')
    stop = startPrayerSync()
    stop()
    usePrayerStore.getState().setAllAlerts('chime')
    env.doc.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(env.calls.sync).toBe(0)
    stop = () => {}
  })
})
