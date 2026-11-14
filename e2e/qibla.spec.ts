import { test, expect, type Page } from '@playwright/test'
import { sunAid, sunPosition } from '../src/lib/qibla/sun'

// Qibla (all-in-one spec 2.2, qibla package). The fallback (bearing, north-up
// diagram, sun aid) is what every desktop browser shows, so it is what most of
// this checks; the live compass is driven with synthetic orientation events.

const LONDON = { lat: 51.51, lng: -0.13, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'city' }
const QIBLA_LONDON = 119 // 118.99 rounded

async function seed(page: Page, place: typeof LONDON | null) {
  await page.addInitScript((p) => {
    localStorage.setItem('onboarding-complete', 'true')
    if (p) localStorage.setItem('takrar-place', JSON.stringify({ state: { place: p }, version: 1 }))
  }, place)
}

/** Fails the test if the saved coordinates show up in any request URL or body */
function guardCoordinates(page: Page) {
  const leaks: string[] = []
  page.on('request', (req) => {
    const hay = `${req.url()} ${req.postData() ?? ''}`
    if (hay.includes(String(LONDON.lat)) || hay.includes(String(LONDON.lng))) leaks.push(req.url())
  })
  return leaks
}

test.describe('qibla', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('without a place it points to prayer setup', async ({ page }) => {
    await seed(page, null)
    await page.goto('/qibla')
    await expect(page.getByRole('heading', { name: 'Set your place first' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Set your place' })).toHaveAttribute('href', '/prayer/setup')
  })

  test('no sensor: bearing, north-up diagram and the sun aid, nothing sent anywhere', async ({ page }) => {
    const at = new Date('2026-03-15T11:00:00Z') // late morning in London
    await page.clock.setFixedTime(at)
    await seed(page, LONDON)
    const leaks = guardCoordinates(page)
    await page.goto('/qibla')

    await expect(page.locator('[data-qibla-bearing]')).toHaveText(`${QIBLA_LONDON}°`)
    await expect(page.locator('[data-qibla-direction]')).toHaveText('East-southeast')
    // The compass caveat belongs to the live compass, not to a device without one
    await expect(page.locator('[data-qibla]')).not.toContainText('Phone compasses can be off')
    await expect(page.locator('[data-qibla-dial="diagram"]')).toBeVisible()
    await expect(page.locator('[data-qibla-notice="no-sensor"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /compass/i })).toHaveCount(0)

    const aid = sunAid(118.99, sunPosition(at.getTime(), LONDON.lat, LONDON.lng))
    expect(aid.kind).toBe('side')
    if (aid.kind === 'side') {
      await expect(page.locator('[data-sun-aid]')).toContainText(`The sun is now ${aid.degrees}° to the ${aid.side} of the qibla.`)
    }
    // No horizontal scroll at 375px
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    expect(leaks).toEqual([])
  })

  test('the sun aid hides at night', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-03-15T23:00:00Z'))
    await seed(page, LONDON)
    await page.goto('/qibla')
    await expect(page.locator('[data-qibla-bearing]')).toHaveText(`${QIBLA_LONDON}°`)
    await expect(page.locator('[data-sun-aid]')).toHaveCount(0)
  })

  test('in Makkah it says a saved place is too rough, and makes no exactness claim', async ({ page }) => {
    await seed(page, { ...LONDON, lat: 21.3891, lng: 39.8579, label: 'Makkah', countryCode: 'SA', tz: 'Asia/Riyadh' })
    await page.goto('/qibla')
    await expect(page.locator('[data-qibla-notice="near-kaaba"]')).toBeVisible()
    await expect(page.locator('[data-qibla-notice="near-kaaba"]')).toContainText('too rough to give a direction')
    await expect(page.locator('[data-qibla]')).not.toContainText('exact')
  })

  test('away from Makkah there is no such note', async ({ page }) => {
    await seed(page, LONDON)
    await page.goto('/qibla')
    await expect(page.locator('[data-qibla-bearing]')).toHaveText(`${QIBLA_LONDON}°`)
    await expect(page.locator('[data-qibla-notice="near-kaaba"]')).toHaveCount(0)
  })

  test('dark theme and reduced motion render the same fallback', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await seed(page, LONDON)
    await page.addInitScript(() => localStorage.setItem('quran-dark-mode', 'true'))
    await page.goto('/qibla')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('[data-qibla-bearing]')).toHaveText(`${QIBLA_LONDON}°`)
  })

  test('a phone compass: asked on tap, turns the dial, says when aligned', async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    await seed(page, LONDON)
    await page.goto('/qibla')
    // Nothing starts by itself on the web
    await expect(page.locator('[data-qibla-dial="diagram"]')).toBeVisible()
    await page.getByRole('button', { name: 'Use my phone’s compass' }).click()

    const send = async (alpha: number) => {
      for (let i = 0; i < 25; i++) {
        await page.evaluate((a) => {
          const e = new Event('deviceorientationabsolute')
          Object.assign(e, { alpha: a, beta: 0, gamma: 0, absolute: true })
          window.dispatchEvent(e)
        }, alpha)
        await page.waitForTimeout(20)
      }
    }
    // Phone pointing at magnetic north: turn right towards the qibla
    await send(0)
    await expect(page.locator('[data-qibla-dial="live"]')).toBeVisible()
    await expect(page.locator('[data-qibla-readout="live"]')).toContainText(/Turn 11[5-9]° right/)
    // Screen readers get one status, not a live region that speaks every degree
    await expect(page.locator('[data-qibla-status]')).toHaveText('Turn right')
    await expect(page.locator('[data-qibla-readout] [aria-live]')).toHaveCount(0)
    // Magnetic heading 119: London's declination is about +1°, so this is within the aligned margin
    await send(360 - 119)
    await expect(page.locator('[data-qibla-readout="live"]')).toContainText('Facing the qibla')
    await expect(page.locator('[data-qibla-status]')).toHaveText('Facing the qibla')
    // One button throughout, so focus stays on it as its job changes
    const action = page.locator('[data-qibla-action]')
    await expect(action).toHaveCount(1)
    await expect(action).toHaveText('Show the diagram instead')
    await action.click()
    await expect(page.locator('[data-qibla-dial="diagram"]')).toBeVisible()
    await expect(action).toBeFocused()
    await context.close()
  })

  test('a browser that offers the event but sends no readings falls back', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    await seed(page, LONDON)
    await page.goto('/qibla')
    await page.getByRole('button', { name: 'Use my phone’s compass' }).click()
    await expect(page.locator('[data-qibla-notice="no-data"]')).toBeVisible({ timeout: 6000 })
    await expect(page.locator('[data-qibla-notice="no-data"]')).toHaveAttribute('role', 'status')
    await expect(page.getByRole('button', { name: 'Try the compass again' })).toBeVisible()
    await expect(page.locator('[data-qibla-bearing]')).toHaveText(`${QIBLA_LONDON}°`)
    await context.close()
  })

  test('works after an offline reload', async ({ page, context }, testInfo) => {
    // The service worker is the web's offline path (the apps carry the bundle);
    // it stays off on "localhost", so use the loopback address
    test.skip(testInfo.project.name !== 'web', 'static web hosting only')
    const base = new URL(testInfo.project.use.baseURL ?? 'http://localhost')
    base.hostname = '127.0.0.1'
    await seed(page, LONDON)
    await page.goto(new URL('/qibla', base).href)
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload() // now under the worker, which caches the page and its assets
    await expect(page.locator('[data-qibla-bearing]')).toHaveText(`${QIBLA_LONDON}°`)
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('[data-qibla-bearing]')).toHaveText(`${QIBLA_LONDON}°`)
    await expect(page.locator('[data-qibla-dial="diagram"]')).toBeVisible()
    await context.setOffline(false)
  })
})
