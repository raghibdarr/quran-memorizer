import { test, expect, type Page, type Request } from '@playwright/test'

// Mosque finder (all-in-one spec 2.2, 4, 7): a seeded place lists the nearest
// mosques from its country's pack, and the only data request the screen makes
// is that one file, with no coordinates in it.

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
  test('a seeded place lists the nearest mosques, and the only data request is the country file', async ({ page }) => {
    await seed(page, PLACE)
    const all: Request[] = []
    page.on('request', (r) => all.push(r))

    // The UK list is small, so it loads as the screen opens: no confirm step
    await page.goto('/mosques')
    const rows = page.locator('[data-mosque]')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    await expect(rows).toHaveCount(20)
    await expect(page.locator('[data-mosques-confirm]')).toHaveCount(0)
    await expect(page.locator('[data-mosques-attribution]')).toContainText('Data © OpenStreetMap contributors (ODbL)')
    await page.waitForLoadState('networkidle')

    const data = all.filter((r) => new URL(r.url()).pathname.startsWith('/data/'))
    expect(data.map((r) => new URL(r.url()).pathname + new URL(r.url()).search)).toEqual(['/data/mosques/GB.json'])
    expect(data[0].method()).toBe('GET')
    expect(data[0].postData()).toBeNull()
    // And nothing the page ever sent carries the position
    expect(all.filter(leaksPosition).map((r) => r.url())).toEqual([])

    // Sorted nearest first. Inside the place's rounding a row says "Under 1 mi" with no
    // direction; further out, a distance and a compass point. (The UK reads miles.)
    const lines = (await rows.locator('[data-mosque-distance] > span[aria-hidden]:not(:has(svg))').allInnerTexts()).map((t) => t.trim())
    // East London is not short of mosques: the nearest is under a mile away
    expect(lines[0]).toBe('Under 1 mi')
    for (const t of lines) expect(t).toMatch(/^(Under 1 mi|\d+(\.\d)? mi · (N|NE|E|SE|S|SW|W|NW))$/)
    const values = lines.map((t) => (t.startsWith('Under') ? 0 : Number(t.split(' ')[0])))
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])

    // The whole row is the link: geo: on Android, maps: on Apple hosts, openstreetmap.org elsewhere
    const href = await rows.first().locator('[data-mosque-maps]').getAttribute('href')
    expect(href).toMatch(/^(geo:-?\d+(\.\d+)?,-?\d+(\.\d+)?\?q=|maps:\/\/\?ll=-?\d+(\.\d+)?,-?\d+(\.\d+)?&q=|https:\/\/www\.openstreetmap\.org\/\?mlat=-?\d+(\.\d+)?&mlon=)/)

    await page.locator('[data-mosques-more]').click()
    await expect(rows).toHaveCount(40)
  })

  test('a big list asks first, then loads only its own file', async ({ page }) => {
    await seed(page, { lat: 41.01, lng: 28.98, label: 'Istanbul', countryCode: 'TR', tz: 'Europe/Istanbul', source: 'city' })
    const data: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/data/')) data.push(new URL(r.url()).pathname)
    })
    await page.goto('/mosques')
    await expect(page.locator('[data-mosques-confirm]')).toContainText('Mosques near Istanbul', { timeout: 15_000 })
    await expect(page.locator('[data-mosques-confirm]')).toContainText("Your location isn't sent")
    expect(data).toEqual([])
    await page.locator('[data-mosques-load]').click()
    await expect(page.locator('[data-mosque]')).toHaveCount(20)
    expect(data).toEqual(['/data/mosques/TR.json'])
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
    await expect(page.locator('[data-mosques-empty]')).toContainText("We don't have a mosque list for")
    await expect(page.locator('[data-mosques-change]')).toHaveAttribute('href', /\/prayer\/settings/)
    await expect(page.locator('[data-mosques-attribution]')).toBeVisible()
    expect(data).toEqual([])
  })

  test('a place with no country code offers the city picker', async ({ page }) => {
    await seed(page, { lat: 10.5, lng: 20.5, label: 'Somewhere', countryCode: '', tz: 'UTC', source: 'gps' })
    await page.goto('/mosques')
    await expect(page.locator('[data-mosques-nocountry]')).toContainText("We couldn't tell which country you're in", { timeout: 15_000 })
    await expect(page.locator('[data-mosques-setup]')).toHaveText('Choose a city')
  })
})
