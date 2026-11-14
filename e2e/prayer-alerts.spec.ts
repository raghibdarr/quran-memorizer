import { test, expect, type Page } from '@playwright/test'

// /prayer/alerts (all-in-one spec 2.2, 6). On the web, alerts can't exist
// without a server learning the user's times, so the screen says so plainly
// and asks for nothing. In the app shell (here a mocked Android bridge) it
// offers per-prayer modes, asks for notification permission only when alerts
// are turned on, and shows the health check.

const PLACE = { lat: 51.51, lng: -0.13, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'city' }

async function seed(page: Page, withPlace = true) {
  await page.addInitScript((place) => {
    localStorage.setItem('onboarding-complete', 'true')
    if (place) localStorage.setItem('takrar-place', JSON.stringify({ state: { place }, version: 1 }))
  }, withPlace ? PLACE : null)
}

/** Every request URL and body, to prove the coordinates never leave the page */
function watchRequests(page: Page) {
  const seen: string[] = []
  page.on('request', (r) => seen.push(`${r.url()} ${r.postData() ?? ''}`))
  return seen
}

/** Pretends to be the Android app: Capacitor's native bridge answered by an in-page fake OS */
async function mockAndroid(page: Page, opts: { display: 'granted' | 'prompt'; exact: 'granted' | 'denied' }) {
  await page.addInitScript((o) => {
    const state = { display: o.display, exact: o.exact, pending: new Map<number, unknown>(), requests: 0 }
    ;(window as unknown as { __os: typeof state }).__os = state
    const methods = ['checkPermissions', 'requestPermissions', 'checkExactNotificationSetting', 'changeExactNotificationSetting', 'getPending', 'schedule', 'cancel', 'createChannel']
    const w = window as unknown as Record<string, unknown>
    w.CapacitorCustomPlatform = { name: 'android' }
    w.Capacitor = {
      PluginHeaders: [{ name: 'LocalNotifications', methods: methods.map((name) => ({ name, rtype: 'promise' })) }],
      nativePromise: async (plugin: string, method: string, options: { notifications?: { id: number }[] }) => {
        if (plugin !== 'LocalNotifications') throw new Error('not mocked')
        switch (method) {
          case 'checkPermissions':
            return { display: state.display }
          case 'requestPermissions':
            state.requests++
            state.display = 'granted'
            return { display: 'granted' }
          case 'checkExactNotificationSetting':
          case 'changeExactNotificationSetting':
            return { exact_alarm: state.exact }
          case 'getPending':
            return { notifications: [...state.pending.values()] }
          case 'schedule':
            for (const n of options.notifications ?? []) state.pending.set(n.id, n)
            return { notifications: (options.notifications ?? []).map((n) => ({ id: n.id })) }
          case 'cancel':
            for (const n of options.notifications ?? []) state.pending.delete(n.id)
            return undefined
          default:
            return undefined
        }
      },
    }
  }, opts)
}

test.describe('prayer alerts', () => {
  test('web shows the honest message and asks for nothing', async ({ page }) => {
    await seed(page)
    const requests = watchRequests(page)
    await page.goto('/prayer/alerts')
    await expect(page.getByText('Prayer alerts need the app. Times work here.')).toBeVisible()
    await expect(page.locator('[data-alert-row]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /see today/i })).toBeVisible()
    expect(requests.some((r) => r.includes('51.51') || r.includes('-0.13'))).toBe(false)
  })

  test('app: turning alerts on asks permission once, then plans them', async ({ page }) => {
    await seed(page)
    await mockAndroid(page, { display: 'prompt', exact: 'denied' })
    await page.goto('/prayer/alerts')

    // Nothing asked on arrival
    await expect(page.getByText('Tell me when each prayer starts?')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __os: { requests: number } }).__os.requests)).toBe(0)
    await expect(page.locator('[data-alert-row]')).toHaveCount(5)
    await expect(page.locator('[data-health="exact"]')).toContainText('may arrive several minutes late')

    await page.getByRole('button', { name: 'Notify me for every prayer' }).click()
    await expect(page.getByText('Tell me when each prayer starts?')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __os: { requests: number } }).__os.requests)).toBe(1)

    // The sync plans 30 days, inexactly (no exact-alarm grant)
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __os: { pending: Map<number, unknown> } }).__os.pending.size), { timeout: 10_000 })
      .toBeGreaterThan(100)
    const sample = await page.evaluate(() => {
      const all = [...(window as unknown as { __os: { pending: Map<number, { id: number; body: string; isExactNotification?: boolean }> } }).__os.pending.values()]
      return { ids: all.map((n) => n.id), exact: all.some((n) => n.isExactNotification), body: all.find((n) => n.id < 21000)!.body }
    })
    expect(sample.ids.every((id) => id >= 20000 && id <= 21000)).toBe(true)
    expect(sample.ids).toContain(21000)
    expect(sample.exact).toBe(false)
    expect(sample.body).toMatch(/^(Fajr|Dhuhr|Asr|Maghrib|Isha) · \d\d:\d\d$/)
    await expect(page.locator('[data-health="pending"]')).toContainText(/alerts, up to/, { timeout: 10_000 })
  })
})
