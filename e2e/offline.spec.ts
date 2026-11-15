import { test, expect } from '@playwright/test'

// Offline-first on the web (spec 1.1, 3.7): once the service worker has
// installed, the Prayer tools open with no signal, cold, even if never visited.
// The worker registers only off localhost (src/components/providers.tsx), so
// this runs against the static web build on 127.0.0.1.

test.describe('web PWA offline shell', () => {
  test.skip(({ baseURL }) => !baseURL?.includes(':4173'), 'static web build only')

  test('Qibla, Tasbih and Zakat open cold with no network', async ({ page, context }) => {
    const origin = 'http://127.0.0.1:4173'
    await page.addInitScript(() => localStorage.setItem('onboarding-complete', 'true'))
    await page.goto(`${origin}/`)
    // The worker installs (precaching the shell) and takes control
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready
      return !!reg.active
    }, null, { timeout: 30_000 })
    await expect
      .poll(async () => page.evaluate(async () => !!(await caches.match('/qibla')) && !!(await caches.match('/zakat'))), { timeout: 30_000 })
      .toBe(true)

    await context.setOffline(true)
    for (const route of ['/qibla', '/tasbih', '/zakat']) {
      await page.goto(`${origin}${route}`)
      await expect(page.getByText("You're offline")).toHaveCount(0)
      await expect(page.locator('main').first()).toBeVisible()
    }
    // A soft navigation from a cached page reaches a tool too
    await page.goto(`${origin}/prayer`)
    await expect(page.locator('[data-prayer-hub]')).toBeVisible()
    await context.setOffline(false)
  })
})
