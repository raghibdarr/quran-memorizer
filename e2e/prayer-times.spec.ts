import { test, expect, type BrowserContext, type Page } from '@playwright/test'

// Prayer times (all-in-one package prayer-times): the hub, setup with and
// without location, the Home strip, offline reload, and that no coordinate ever
// leaves the device. State is seeded through localStorage; the clock is fixed.

// 15 March 2026, 14:00 in Makkah (UTC+3). Umm al-Qura times that day (adhan
// reference, src/lib/prayer/engine.test.ts): Fajr 05:14, Sunrise 06:29,
// Dhuhr 12:30, Asr 15:54, Maghrib 18:30, Isha 20:00.
const AT_1400 = new Date('2026-03-15T14:00:00+03:00')

const MAKKAH_PLACE = { lat: 21.42, lng: 39.83, label: 'Makkah, Saudi Arabia', countryCode: 'SA', tz: 'Asia/Riyadh', source: 'city' }

async function seed(page: Page, opts: { place?: boolean; homeStrip?: boolean } = {}) {
  const { place = true, homeStrip = true } = opts
  await page.addInitScript(
    ({ p, place, homeStrip }) => {
      localStorage.setItem('onboarding-complete', 'true')
      if (place) {
        localStorage.setItem('takrar-place', JSON.stringify({ state: { place: p }, version: 1 }))
        localStorage.setItem(
          'takrar-prayer',
          JSON.stringify({ state: { method: 'UmmAlQura', madhab: 'standard', highLatRule: 'auto', setupDone: true, homeStrip }, version: 1 }),
        )
      }
    },
    { p: MAKKAH_PLACE, place, homeStrip },
  )
}

/** Every request URL and body the page sends, for the privacy check */
function recordRequests(context: BrowserContext) {
  const seen: string[] = []
  context.on('request', (r) => {
    seen.push(r.url())
    const body = r.postData()
    if (body) seen.push(body)
  })
  return seen
}

/** A Makkah-ish coordinate in any form: 21.42 / 21.4225 / 39.83 / 39.8262 */
const COORDS = /21[.,]4\d|39[.,]8\d/

/** Counts calls to the geolocation API, so a prompt before a tap would show up */
async function watchGeolocation(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number }
    w.__geoCalls = 0
    const geo = navigator.geolocation
    if (!geo) return
    const original = geo.getCurrentPosition.bind(geo)
    geo.getCurrentPosition = (...args: Parameters<Geolocation['getCurrentPosition']>) => {
      w.__geoCalls++
      return original(...args)
    }
    const watch = geo.watchPosition.bind(geo)
    geo.watchPosition = (...args: Parameters<Geolocation['watchPosition']>) => {
      w.__geoCalls++
      return watch(...args)
    }
  })
}
const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)

test.use({ locale: 'en-GB', timezoneId: 'Asia/Riyadh' })

test.describe('prayer hub', () => {
  test('shows six times, five prayers, and highlights the next one', async ({ page }) => {
    await page.clock.setFixedTime(AT_1400)
    await seed(page)
    await page.goto('/prayer')

    const rows = page.locator('[data-prayer-row]')
    await expect(rows).toHaveCount(6)
    await expect(page.locator('[data-prayer-row]:not([data-prayer-row="sunrise"])')).toHaveCount(5)
    await expect(page.locator('[data-prayer-row="asr"]')).toHaveAttribute('data-next', 'true')
    await expect(page.locator('[data-next="true"]')).toHaveCount(1)
    await expect(page.locator('[data-prayer-row="asr"]')).toContainText('15:54')
    await expect(page.locator('[data-prayer-row="fajr"]')).toContainText('05:14')
    await expect(page.locator('[data-prayer-row="isha"]')).toContainText('20:00')

    const hero = page.locator('[data-next-hero]')
    await expect(hero).toContainText('Asr')
    await expect(hero).toContainText('15:54')
    await expect(page.locator('[data-countdown]')).toHaveText('in 1 h 54 min')
    await expect(page.locator('[data-place-label]')).toContainText('Makkah')
    // Phone and place share a clock: no "Update location?"
    await expect(page.locator('[data-tz-mismatch]')).toHaveCount(0)
  })

  test('rolls to tomorrow’s Fajr after Isha', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-03-15T21:30:00+03:00'))
    await seed(page)
    await page.goto('/prayer')
    await expect(page.locator('[data-next-hero]')).toContainText('Fajr')
    await expect(page.locator('[data-next-hero]')).toContainText('tomorrow')
    await expect(page.locator('[data-next="true"]')).toHaveCount(0)
  })

  test('offers "Update location?" when the phone is on another clock, and remembers a dismissal', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: 'en-GB', timezoneId: 'Europe/London' })
    const page = await context.newPage()
    await page.clock.setFixedTime(AT_1400)
    await seed(page)
    await page.goto('/prayer')
    const line = page.locator('[data-tz-mismatch]')
    await expect(line).toContainText('Update location?')
    // Times stay in the place's zone, not the phone's
    await expect(page.locator('[data-prayer-row="asr"]')).toContainText('15:54')
    await line.getByRole('button', { name: 'Dismiss' }).click()
    await expect(line).toHaveCount(0)
    await page.reload()
    await expect(page.locator('[data-prayer-row="asr"]')).toBeVisible()
    await expect(line).toHaveCount(0)
    await context.close()
  })

  test('far north: a time that does not exist is named, never shown, and a time past midnight says so', async ({ page }) => {
    const seedPlace = (place: object, prayer: object) =>
      page.addInitScript(
        ({ place, prayer }) => {
          localStorage.setItem('onboarding-complete', 'true')
          localStorage.setItem('takrar-place', JSON.stringify({ state: { place }, version: 1 }))
          // Only on first load: the test changes the rule below and reloads
          if (!localStorage.getItem('takrar-prayer')) {
            localStorage.setItem('takrar-prayer', JSON.stringify({ state: { ...prayer, madhab: 'standard', setupDone: true }, version: 1 }))
          }
        },
        { place, prayer },
      )
    // Tromsø at midsummer under a fixed rule: the sun never sets, so Fajr, Sunrise, Maghrib and Isha have no time
    await page.clock.setFixedTime(new Date('2026-06-21T12:00:00+02:00'))
    await seedPlace(
      { lat: 69.65, lng: 18.96, label: 'Tromsø, Norway', countryCode: 'NO', tz: 'Europe/Oslo', source: 'city' },
      { method: 'MuslimWorldLeague', highLatRule: 'middleofthenight' },
    )
    await page.goto('/prayer')
    await expect(page.locator('[data-prayer-row]')).toHaveCount(6)
    for (const name of ['fajr', 'sunrise', 'maghrib', 'isha']) {
      const row = page.locator(`[data-prayer-row="${name}"]`)
      await expect(row).toContainText('No time today')
      await expect(row).not.toContainText(/\d\d:\d\d/)
    }
    await expect(page.locator('[data-prayer-row="dhuhr"]')).toContainText(/12:\d\d/)
    await expect(page.locator('[data-missing-times]')).toContainText('Fajr, Sunrise, Maghrib and Isha')
    await expect(page.locator('[data-next-hero]')).toHaveAttribute('data-next-hero', 'dhuhr')
    await expect(page.locator('[data-day-shift]')).toHaveCount(0)

    // The automatic rule fills them in; Isha then falls after midnight and the row says so
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('takrar-prayer')!)
      raw.state.highLatRule = 'auto'
      localStorage.setItem('takrar-prayer', JSON.stringify(raw))
    })
    await page.reload()
    await expect(page.locator('[data-prayer-row]')).toHaveCount(6)
    await expect(page.locator('[data-missing-times]')).toHaveCount(0)
    await expect(page.locator('[data-prayer-row="isha"]')).toContainText(/00:\d\d/)
    await expect(page.locator('[data-prayer-row="isha"] [data-day-shift]')).toHaveText('after midnight')
    await expect(page.locator('[data-prayer-row="dhuhr"] [data-day-shift]')).toHaveCount(0)
  })

  test('before setup: one setup card and no location request', async ({ page }) => {
    await watchGeolocation(page)
    await seed(page, { place: false })
    await page.goto('/prayer')
    await expect(page.getByRole('link', { name: 'Set up prayer times' })).toBeVisible()
    await expect(page.locator('[data-prayer-row]')).toHaveCount(0)
    expect(await geoCalls(page)).toBe(0)
  })
})

test.describe('prayer setup', () => {
  test('with location: one fix on tap, labelled by the nearest city, and no coordinate in any request', async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      locale: 'en-GB',
      timezoneId: 'Asia/Riyadh',
      permissions: ['geolocation'],
      geolocation: { latitude: 21.4225, longitude: 39.8262 },
    })
    const seen = recordRequests(context)
    const page = await context.newPage()
    await watchGeolocation(page)
    await seed(page, { place: false })

    await page.goto('/prayer')
    await page.getByRole('link', { name: 'Set up prayer times' }).click()
    await expect(page.getByRole('heading', { name: 'Where are you?' })).toBeVisible()
    expect(await geoCalls(page)).toBe(0) // nothing asked before the tap

    await page.getByRole('button', { name: 'Use my location' }).click()
    await expect(page.locator('[data-setup-place]')).toContainText('Makkah, Saudi Arabia')
    expect(await geoCalls(page)).toBe(1)
    // Pre-chosen for Saudi Arabia, with the reason
    await expect(page.locator('[data-method-label]')).toHaveText('Umm al-Qura, Makkah')
    await expect(page.getByText('Saudi Arabia’s official times use the Umm al-Qura method.')).toBeVisible()
    await expect(page.locator('[data-times-preview]')).toContainText('Maghrib')

    await page.locator('[data-setup-next]').click()
    await expect(page.getByRole('heading', { name: 'Tell me when each prayer starts?' })).toBeVisible()
    await expect(page.locator('[data-setup-alerts]')).toHaveAttribute('href', '/prayer/alerts')
    await page.getByRole('button', { name: 'Not now' }).click()

    await expect(page).toHaveURL(/\/prayer$/)
    await expect(page.locator('[data-prayer-row]')).toHaveCount(6)
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('takrar-place') ?? 'null'))
    expect(stored.state.place).toMatchObject({ lat: 21.42, lng: 39.83, source: 'gps', countryCode: 'SA', tz: 'Asia/Riyadh' })

    // Privacy: the position never appears in a URL or a request body
    await page.goto('/')
    await expect(page.locator('[data-home-prayer-strip]')).toBeVisible()
    expect(seen.length).toBeGreaterThan(0)
    for (const s of seen) expect(s, s.slice(0, 200)).not.toMatch(COORDS)
    await context.close()
  })

  test('without location: a city search needs no permission', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: 'en-GB', timezoneId: 'Europe/London' })
    const seen = recordRequests(context)
    const page = await context.newPage()
    await watchGeolocation(page)
    await seed(page, { place: false })

    await page.goto('/prayer/setup')
    await page.getByRole('button', { name: 'Choose a city' }).click()
    await page.getByPlaceholder('Search for your city').fill('London')
    await page.locator('[data-city="London/GB"]').click()
    await expect(page.locator('[data-setup-place]')).toContainText('London, United Kingdom')
    await expect(page.locator('[data-method-label]')).toHaveText('Moonsighting Committee')
    await page.locator('[data-choice="asr-hanafi"]').click()
    await page.locator('[data-setup-next]').click()
    await page.getByRole('button', { name: 'Not now' }).click()

    await expect(page.locator('[data-prayer-row]')).toHaveCount(6)
    const prayer = await page.evaluate(() => JSON.parse(localStorage.getItem('takrar-prayer') ?? 'null'))
    expect(prayer.state).toMatchObject({ method: 'MoonsightingCommittee', madhab: 'hanafi', setupDone: true })
    expect(await geoCalls(page)).toBe(0)
    // London's position (51.51, -0.13) isn't sent either
    for (const s of seen) expect(s).not.toMatch(/51[.,]5\d|-0[.,]1\d/)
    await context.close()
  })

  test('a refused location falls straight to the city search', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: 'en-GB', timezoneId: 'Asia/Riyadh', permissions: [] })
    const page = await context.newPage()
    await seed(page, { place: false })
    await page.goto('/prayer/setup')
    await page.getByRole('button', { name: 'Use my location' }).click()
    await expect(page.getByPlaceholder('Search for your city')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('choose your city instead')
    await context.close()
  })
})

test.describe('settings', () => {
  test('changes update the times at once', async ({ page }) => {
    await page.clock.setFixedTime(AT_1400)
    await seed(page)
    await page.goto('/prayer/settings')
    const preview = page.locator('[data-times-preview]')
    await expect(preview).toContainText('15:54')
    await page.locator('[data-choice="asr-hanafi"]').click()
    await expect(preview).not.toContainText('15:54')
    await page.locator('[data-offset="maghrib"]').getByRole('button', { name: /More/ }).click()
    await expect(preview).toContainText('18:31')
  })
})

test.describe('Home strip', () => {
  test('shows the next prayer once a place exists', async ({ page }) => {
    await page.clock.setFixedTime(AT_1400)
    await seed(page)
    await page.goto('/')
    await expect(page.locator('[data-home-prayer-strip]')).toContainText('Asr 15:54 · in 1 h 54 min')
  })

  test('shows nothing without a place, or when turned off', async ({ page }) => {
    await seed(page, { place: false })
    await page.goto('/')
    await expect(page.getByText('Quran Memorization')).toBeVisible()
    await expect(page.locator('[data-home-prayer-strip]')).toHaveCount(0)
  })

  test('respects the Home strip toggle', async ({ page }) => {
    await seed(page, { homeStrip: false })
    await page.goto('/')
    await expect(page.getByText('Quran Memorization')).toBeVisible()
    await expect(page.locator('[data-home-prayer-strip]')).toHaveCount(0)
  })
})

test.describe('offline', () => {
  // The service worker registers only off localhost (src/components/providers.tsx),
  // so this runs against the static build at 127.0.0.1
  test('/prayer reloads offline with its times', async ({ browser, baseURL }) => {
    test.skip(!baseURL || baseURL.includes(':3000'), 'needs the static build (the dev server has no service worker)')
    const url = new URL(baseURL!)
    url.hostname = '127.0.0.1'
    const context = await browser.newContext({ baseURL: url.origin, locale: 'en-GB', timezoneId: 'Asia/Riyadh' })
    const page = await context.newPage()
    await page.clock.setFixedTime(AT_1400)
    await seed(page)
    await page.goto('/prayer')
    await page.evaluate(() => navigator.serviceWorker.ready)
    // Once the worker controls the page, a reload fills its caches
    await page.reload()
    await expect(page.locator('[data-prayer-row]')).toHaveCount(6)
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('[data-prayer-row]')).toHaveCount(6)
    await expect(page.locator('[data-prayer-row="asr"]')).toContainText('15:54')
    await context.close()
  })
})
