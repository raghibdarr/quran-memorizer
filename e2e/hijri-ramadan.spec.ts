import { test, expect, type Page } from '@playwright/test'

// Hijri calendar and Ramadan mode (all-in-one spec 2.2; package hijri-ramadan).
// State is seeded through localStorage (only when absent, so a reload keeps what
// the test changed) and time is pinned with page.clock.

const LONDON = { lat: 51.51, lng: -0.13, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'city' }

async function seed(page: Page, prayer: Record<string, unknown> = {}, withPlace = true) {
  await page.addInitScript(
    ([prayerState, place]) => {
      localStorage.setItem('onboarding-complete', 'true')
      if (place && !localStorage.getItem('takrar-place')) {
        localStorage.setItem('takrar-place', JSON.stringify({ state: { place }, version: 1 }))
      }
      if (!localStorage.getItem('takrar-prayer')) {
        localStorage.setItem('takrar-prayer', JSON.stringify({ state: { setupDone: true, ...prayerState }, version: 1 }))
      }
    },
    [prayer, withPlace ? LONDON : null] as const,
  )
}

test.describe('Hijri calendar', () => {
  test('month view renders with today marked, and navigates', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-13T12:00:00Z') })
    await seed(page)
    await page.goto('/calendar')
    await expect(page.locator('[data-month-title]')).toHaveText('Jumada al-Akhirah 1448')
    await expect(page.locator('[data-hijri-today]')).toContainText('3 Jumada al-Akhirah 1448')
    const grid = page.locator('[data-month-grid]')
    await expect(grid.locator('button[data-iso]')).toHaveCount(29)
    await expect(grid.locator('[aria-current="date"]')).toHaveAttribute('data-iso', '2026-11-13')
    await expect(page.locator('[data-coming-up]')).toContainText('Ramadan')
    await expect(page.locator('[data-coming-up]')).toContainText('Monday 8 February 2027')

    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(page.locator('[data-month-title]')).toHaveText('Rajab 1448')
    await page.getByRole('button', { name: 'Back to today' }).click()
    await expect(page.locator('[data-month-title]')).toHaveText('Jumada al-Akhirah 1448')
  })

  test('the Hijri offset moves every date', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-13T12:00:00Z') })
    await seed(page, { hijriOffset: 1 })
    await page.goto('/calendar')
    await expect(page.locator('[data-hijri-today]')).toContainText('4 Jumada al-Akhirah 1448')
    await expect(page.locator('[data-coming-up]')).toContainText('Sunday 7 February 2027')
    await page.getByRole('button', { name: 'Start months a day later' }).click()
    await expect(page.locator('[data-hijri-offset]')).toHaveText('0')
    await expect(page.locator('[data-hijri-today]')).toContainText('3 Jumada al-Akhirah 1448')
  })

  test('reloads offline', async ({ page, context, baseURL }) => {
    // The service worker registers on a real host only (never on "localhost"),
    // and the dev server's chunks aren't cacheable: static builds only
    test.skip(!baseURL || new URL(baseURL).port === '3000', 'needs the static build')
    const url = new URL('/calendar', baseURL)
    url.hostname = '127.0.0.1'
    await seed(page)
    await page.goto(url.toString())
    await expect(page.locator('[data-month-grid]')).toBeVisible()
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    // Second load goes through the worker, so the page and its chunks are cached
    await page.reload()
    await expect(page.locator('[data-month-grid]')).toBeVisible()
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('[data-month-grid] button[data-iso]').first()).toBeVisible()
    await expect(page.locator('[data-month-title]')).not.toBeEmpty()
    await context.setOffline(false)
  })
})

test.describe('Ramadan', () => {
  test('fasting log: mark a day, and it survives a reload', async ({ page }) => {
    await page.clock.install({ time: new Date('2027-02-20T15:00:00Z') })
    await seed(page)
    await page.goto('/ramadan')
    await expect(page.locator('[data-fast-hero]')).toContainText('Day 13 of Ramadan')
    await expect(page.locator('[data-countdown="iftar"]')).toBeVisible()
    await expect(page.locator('[data-make-up-left]')).toHaveText('0')

    await page.locator('[data-ramadan-log] [data-day="2027-02-10"]').click()
    await page.locator('[data-ramadan-log] button[data-mark="owed"]').click()
    await page.locator('[data-ramadan-log] [data-day="2027-02-11"]').click()
    await page.locator('[data-ramadan-log] button[data-mark="fasted"]').click()
    await expect(page.locator('[data-make-up-left]')).toHaveText('1')

    await page.reload()
    await expect(page.locator('[data-ramadan-log] [data-day="2027-02-10"]')).toHaveAttribute('data-mark', 'owed')
    await expect(page.locator('[data-ramadan-log] [data-day="2027-02-11"]')).toHaveAttribute('data-mark', 'fasted')
    await expect(page.locator('[data-make-up-left]')).toHaveText('1')
    await expect(page.locator('[data-ramadan-counts]')).toContainText('1 fasted · 1 to make up')

    // A make-up fast ticks it off, and carries after reload too
    await page.locator('[data-made-up]').click()
    await expect(page.locator('[data-make-up-left]')).toHaveText('0')
    await page.reload()
    await expect(page.locator('[data-make-up-left]')).toHaveText('0')
  })

  test('outside Ramadan: a voluntary fast, no countdown until marked', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-13T12:00:00Z') })
    await seed(page)
    await page.goto('/ramadan')
    await expect(page.locator('[data-fast-hero]')).toContainText('Expected to begin on Monday 8 February 2027')
    await expect(page.locator('[data-countdown]')).toHaveCount(0)
    await page.locator('[data-today-fast] button[data-mark="fasted"]').click()
    await expect(page.locator('[data-countdown="iftar"]')).toBeVisible()
    await expect(page.locator('[data-today-fast] button[data-mark]')).toHaveCount(1)
  })

  test('without a place, asks for one', async ({ page }) => {
    await page.clock.install({ time: new Date('2027-02-20T15:00:00Z') })
    await seed(page, {}, false)
    await page.goto('/ramadan')
    await expect(page.getByRole('link', { name: 'Set your place' })).toBeVisible()
  })
})
