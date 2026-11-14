import { test, expect, type Page, type Request } from '@playwright/test'

// Mosque finder (all-in-one spec 2.2, 4, 7): a seeded place lists the nearest
// mosques from its country's pack, and the only request the screen makes is
// that one file, with no coordinates in it.

// Request listeners see everything only when no service worker answers first
test.use({ serviceWorkers: 'block' })

const PLACE = { lat: 51.52, lng: -0.07, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'city' }

async function seed(page: Page, place: object | null) {
  await page.addInitScript((p) => {
    localStorage.setItem('onboarding-complete', 'true')
    if (p) localStorage.setItem('takrar-place', JSON.stringify({ state: { place: p }, version: 1 }))
  }, place)
}

/** Any trace of the place's coordinates in a request's URL or body */
function leaksPosition(r: Request): boolean {
  const text = `${r.url()} ${r.postData() ?? ''}`
  return /51[.,]52|0[.,]07\b/.test(text)
}

test.describe('mosques', () => {
  test('a seeded place lists the nearest mosques, and the only request is the country file', async ({ page }) => {
    await seed(page, PLACE)
    const all: Request[] = []
    page.on('request', (r) => all.push(r))

    await page.goto('/mosques')
    await expect(page.getByText('This loads the mosque list for United Kingdom. Your position is not sent.')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-mosques-attribution]')).toContainText('Data © OpenStreetMap contributors (ODbL)')
    await page.waitForLoadState('networkidle')

    // From here on, the tap on "Show mosques" may make exactly one request
    const after: Request[] = []
    page.on('request', (r) => after.push(r))
    await page.locator('[data-mosques-load]').click()

    const rows = page.locator('[data-mosque]')
    await expect(rows.first()).toBeVisible()
    await expect(rows).toHaveCount(20)
    await page.waitForLoadState('networkidle')

    const urls = after.map((r) => new URL(r.url()).pathname + new URL(r.url()).search)
    expect(urls).toEqual(['/data/mosques/GB.json'])
    expect(after[0].method()).toBe('GET')
    expect(after[0].postData()).toBeNull()
    // And nothing the page ever sent carries the position
    expect(all.filter(leaksPosition).map((r) => r.url())).toEqual([])

    // Sorted nearest first, with a distance, a compass point and an Open in Maps link
    // (The UK reads road distances in miles)
    const lines = (await rows.locator('[data-mosque-distance]').allInnerTexts()).map((t) => t.trim())
    expect(lines[0]).toMatch(/^\d+(\.\d)? mi · (N|NE|E|SE|S|SW|W|NW)$/)
    const href = await rows.first().locator('[data-mosque-maps]').getAttribute('href')
    expect(href).toMatch(/^geo:-?\d+(\.\d+)?,-?\d+(\.\d+)?\?q=/)
    const values = lines.map((t) => Number(t.split(' ')[0]))
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])

    // East London is not short of mosques: the nearest is under a mile away
    expect(values[0]).toBeLessThan(1)

    await page.locator('[data-mosques-more]').click()
    await expect(rows).toHaveCount(40)
  })

  test('without a place it points to prayer setup', async ({ page }) => {
    await seed(page, null)
    await page.goto('/mosques')
    await expect(page.getByText('Set your place first')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-mosques-setup]').click()
    await expect(page).toHaveURL(/\/prayer\/setup/)
  })

  test('a country with no pack says so and loads nothing', async ({ page }) => {
    await seed(page, { lat: 64.13, lng: -21.9, label: 'Nowhere', countryCode: 'XX', tz: 'UTC', source: 'city' })
    const data: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/data/')) data.push(r.url())
    })
    await page.goto('/mosques')
    await expect(page.locator('[data-mosques-empty]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-mosques-empty]')).toContainText('No mosque list for')
    await expect(page.locator('[data-mosques-attribution]')).toBeVisible()
    expect(data).toEqual([])
  })
})
