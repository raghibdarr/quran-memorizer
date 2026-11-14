import { test, expect, type Page } from '@playwright/test'

// Match my mosque (all-in-one spec 2.7): seed a place, type a timetable row,
// Apply, then Undo. The times are adhan's own Muslim World League times for
// London on 15 March 2026 (the engine's golden table), so the wizard should land
// on that method with no adjustments.

const LONDON = { lat: 51.51, lng: -0.13, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'city' }

async function seed(page: Page, withPlace: boolean) {
  await page.addInitScript(
    ([place]) => {
      localStorage.setItem('onboarding-complete', 'true')
      if (place) localStorage.setItem('takrar-place', JSON.stringify({ state: { place }, version: 1 }))
      // Start from Karachi so the change on Apply (and back on Undo) is visible
      localStorage.setItem(
        'takrar-prayer',
        JSON.stringify({ state: { method: 'Karachi', madhab: 'standard', highLatRule: 'auto', setupDone: true }, version: 1 }),
      )
    },
    [withPlace ? LONDON : null] as const,
  )
}

const prayerState = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('takrar-prayer') ?? '{}').state as Record<string, unknown>)

test.describe('match my mosque', () => {
  test('enter times, apply, undo', async ({ page }) => {
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url() + ' ' + (r.postData() ?? '')))
    await seed(page, true)
    await page.goto('/prayer/match')

    await expect(page.getByRole('heading', { name: 'Your mosque’s start times' })).toBeVisible()
    await expect(page.getByText(/not the jama’ah or iqamah times/)).toBeVisible()

    await page.locator('[data-match-date="0"]').fill('2026-03-15')
    const times = { fajr: '04:31', dhuhr: '12:10', asr: '15:21', maghrib: '18:05', isha: '19:49' }
    for (const [p, t] of Object.entries(times)) await page.locator(`[data-match-time="0-${p}"]`).fill(t)
    await page.locator('[data-match-find]').click()

    await expect(page.getByRole('heading', { name: 'Closest match' })).toBeVisible()
    const summary = page.locator('[data-match-summary]')
    await expect(summary).toContainText('Muslim World League')
    await expect(summary).toContainText('None')
    await expect(page.getByText(/not your mosque’s own data/)).toBeVisible()
    await expect(page.locator('[data-match-confidence]')).toContainText('second date about a month away')
    await expect(page.locator('[data-match-table] tr[data-prayer]')).toHaveCount(5)

    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.locator('[data-match-applied]')).toBeVisible()
    let state = await prayerState(page)
    expect(state.method).toBe('MuslimWorldLeague')
    expect((state.previous as { method: string }).method).toBe('Karachi')

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('[data-match-undone]')).toBeVisible()
    state = await prayerState(page)
    expect(state.method).toBe('Karachi')
    expect(state.previous).toBeUndefined()

    // Location never leaves the device
    expect(urls.filter((u) => u.includes('51.51') || u.includes('-0.13'))).toEqual([])
  })

  test('without a place, goes to setup', async ({ page }) => {
    await seed(page, false)
    await page.goto('/prayer/match')
    await expect(page).toHaveURL(/\/prayer\/setup/, { timeout: 15_000 })
  })
})
