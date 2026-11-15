import { test, expect, type BrowserContext, type Page } from '@playwright/test'

// All-in-one integration (spec 7): the features together, as one user would meet
// them. /prayer with a seeded place and every slot filled, the Home strip, the
// Learn hub rows, the Review section, and one request listener over the whole
// run proving the seeded coordinates never leave the device. The backup file is
// checked too: it carries prayer settings and the log, never the place.
// (Sync is device-store-free by construction: src/lib/sync/fixtures.test.ts.)

// Makkah, rounded to 2 dp as the place store keeps it
const PLACE = { lat: 21.42, lng: 39.83, label: 'Makkah, Saudi Arabia', countryCode: 'SA', tz: 'Asia/Riyadh', source: 'city' }
/** The seeded coordinate in any form a leak could take: 21.42 / 21.4225 / 39.83 / 39.8262 */
const COORDS = /21[.,]4\d|39[.,]8\d/

// 15 March 2026, 14:00 in Makkah: Ramadan 1447 (expected), Dhuhr 12:30, Asr 15:54 (Umm al-Qura)
const IN_RAMADAN = new Date('2026-03-15T14:00:00+03:00')
// 15 June 2026, 04:45: after Fajr, before sunrise, out of the Ramadan season
const AFTER_FAJR = new Date('2026-06-15T04:45:00+03:00')

const DEEN_CARD = { deck: 'nawawi40', itemRev: 1, addedAt: 0, easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastReview: 0, lastQuality: 0 }

async function seed(page: Page, opts: { deenCard?: boolean } = {}) {
  await page.addInitScript(
    ({ place, card }) => {
      localStorage.setItem('onboarding-complete', 'true')
      localStorage.setItem('takrar-place', JSON.stringify({ state: { place }, version: 1 }))
      localStorage.setItem(
        'takrar-prayer',
        JSON.stringify({ state: { method: 'UmmAlQura', madhab: 'standard', highLatRule: 'auto', setupDone: true, homeStrip: true }, version: 1 }),
      )
      if (card && !localStorage.getItem('quran-deen')) {
        localStorage.setItem('quran-deen', JSON.stringify({ state: { cards: { 'nawawi40:01:meaning': card } }, version: 1 }))
      }
    },
    { place: PLACE, card: opts.deenCard ? DEEN_CARD : null },
  )
}

/** Every request URL and body any page in the context sends */
function recordRequests(context: BrowserContext) {
  const seen: string[] = []
  context.on('request', (r) => {
    seen.push(r.url())
    const body = r.postData()
    if (body) seen.push(body)
  })
  return seen
}

/** The /prayer chips a person can see (the hub hides the adhkar chip while the Ramadan banner shows) */
const shownChips = (page: Page) => page.locator('[data-chip]:not(:empty):visible')

test.use({ locale: 'en-GB', timezoneId: 'Asia/Riyadh' })

test.describe('all-in-one, together', () => {
  test('/prayer with every slot filled; Home, Learn and Review; no coordinate leaves the device', async ({ page, context }) => {
    const requests = recordRequests(context)
    await seed(page, { deenCard: true })

    // --- /prayer in Ramadan: Hijri line, six rows with ticks, one chip (the Ramadan banner)
    await page.clock.setFixedTime(IN_RAMADAN)
    await page.goto('/prayer')
    await expect(page.locator('[data-prayer-row]')).toHaveCount(6)
    await expect(page.locator('[data-hijri-line]')).toBeVisible()
    await expect(page.locator('[data-hijri-line]')).toContainText('Ramadan')
    await expect(page.locator('[data-tick^="2026-03-15:"]')).toHaveCount(5)
    await expect(page.locator('[data-ramadan-banner]')).toBeVisible()
    await expect(shownChips(page)).toHaveCount(1)
    await expect(page.locator('[data-adhkar-now]')).toBeHidden()

    // A passed prayer's tick logs it; one not yet begun stays inert
    const dhuhr = page.locator('[data-tick="2026-03-15:dhuhr"]')
    await dhuhr.click()
    await expect(dhuhr).toHaveAttribute('data-mark', 'ontime')
    await expect(page.locator('[data-tick="2026-03-15:asr"]')).toBeDisabled()

    // The tools that landed all have tiles
    for (const href of ['/qibla', '/tasbih', '/prayer/tracker', '/calendar', '/ramadan', '/zakat', '/mosques']) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible()
    }

    // --- Out of season, after Fajr: still one chip, the adhkar one, holding both sets
    await page.clock.setFixedTime(AFTER_FAJR)
    await page.goto('/prayer')
    await expect(page.locator('[data-prayer-row]')).toHaveCount(6)
    await expect(page.locator('[data-adhkar-now]')).toHaveCount(1)
    await expect(page.locator('[data-ramadan-banner]')).toHaveCount(0)
    await expect(shownChips(page)).toHaveCount(1)
    await expect(page.locator('[data-adhkar-now-chip="after-prayer"]')).toContainText('After Fajr adhkar')
    await expect(page.locator('[data-adhkar-now-chip="morning"]')).toBeVisible()

    // --- Home strip
    await page.clock.setFixedTime(IN_RAMADAN)
    await page.goto('/')
    await expect(page.locator('[data-home-prayer-strip]')).toBeVisible()
    await expect(page.locator('[data-home-prayer-strip]')).toContainText(/\d\d:\d\d · in /)

    // --- Learn hub: a row per live group, then the older sections
    await page.goto('/essentials')
    for (const group of ['hadith', 'adhkar', 'names', 'course']) {
      await expect(page.locator(`[data-learn-row="${group}"]`)).toBeVisible()
    }
    await expect(page.locator('[data-learn-row="names"]')).toContainText('99 to learn')
    await expect(page.locator('[data-learn-row="hadith"]')).toContainText('1/15')

    // --- Review: no Quran reviews yet, so the deen section comes first, under one quiet line
    await page.goto('/review')
    await expect(page.locator('[data-review-deen-only]')).toBeVisible()
    await expect(page.locator('[data-review-deen-only]')).toContainText('No Quran reviews yet.')
    await expect(page.locator('[data-deen-review-section]')).toBeVisible()
    await expect(page.getByText('Nothing to review yet')).toHaveCount(0)

    // --- The rest of the new screens, cold
    for (const route of ['/qibla', '/tasbih', '/prayer/tracker', '/calendar', '/ramadan', '/zakat', '/mosques', '/prayer/settings', '/prayer/alerts', '/prayer/match', '/hadith', '/adhkar', '/names', '/course', '/glossary', '/sources']) {
      await page.goto(route)
      await expect(page.locator('body')).not.toContainText("This page couldn't load")
    }

    // Nothing the app sent, to any host, carried the place
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.filter((r) => COORDS.test(r))).toEqual([])
  })

  test('the backup file carries prayer settings and the log, never the place', async ({ page }) => {
    await seed(page)
    await page.clock.setFixedTime(IN_RAMADAN)
    await page.goto('/prayer')
    await page.locator('[data-tick="2026-03-15:dhuhr"]').click()
    await expect(page.locator('[data-tick="2026-03-15:dhuhr"]')).toHaveAttribute('data-mark', 'ontime')

    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).first().click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export backup' }).click(),
    ])
    const path = await download.path()
    const { readFileSync } = await import('node:fs')
    const text = readFileSync(path!, 'utf8')
    expect(text).toContain('takrar-prayer')
    expect(text).toContain('takrar-worship')
    expect(text).not.toContain('takrar-place')
    expect(text).not.toMatch(/"lat"|"lng"/)
    expect(text).not.toMatch(COORDS)
  })
})
