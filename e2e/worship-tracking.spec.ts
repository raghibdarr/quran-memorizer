import { test, expect, type Page } from '@playwright/test'

// worship-tracking (all-in-one spec 2.7, 7): the prayer log's row ticks and
// month, make-up prayers and pause, and the tasbih counter. State is seeded
// through localStorage and time is fixed with page.clock.

const LONDON = { lat: 51.51, lng: -0.13, label: 'London', countryCode: 'GB', tz: 'Europe/London', source: 'city' }

async function seed(page: Page, { place = true }: { place?: boolean } = {}) {
  await page.addInitScript(
    ({ place }) => {
      // Only on the first load of the test: later reloads must keep what the test wrote
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('onboarding-complete', 'true')
      if (place) localStorage.setItem('takrar-place', JSON.stringify({ state: { place }, version: 1 }))
    },
    { place: place ? LONDON : null },
  )
}

const tick = (page: Page, iso: string, prayer: string) => page.locator(`[data-tick="${iso}:${prayer}"]`)

test.describe('prayer log', () => {
  test('marks prayers from the row ticks (on time vs late) and keeps them after a reload', async ({ page }) => {
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url() + (r.postData() ?? '')))
    // 20:00 in London on 10 March (GMT): every prayer has begun; Isha is still current
    await page.clock.install({ time: new Date('2026-03-10T20:00:00Z') })
    await seed(page)
    await page.goto('/prayer/tracker')

    await expect(page.locator('[data-today="2026-03-10"]')).toBeVisible()
    await tick(page, '2026-03-10', 'isha').click()
    await expect(tick(page, '2026-03-10', 'isha')).toHaveAttribute('data-mark', 'ontime')
    // Dhuhr's time ended when Asr began: logging it now is late
    await tick(page, '2026-03-10', 'dhuhr').click()
    await expect(tick(page, '2026-03-10', 'dhuhr')).toHaveAttribute('data-mark', 'late')

    await page.reload()
    await expect(tick(page, '2026-03-10', 'isha')).toHaveAttribute('data-mark', 'ontime')
    await expect(tick(page, '2026-03-10', 'dhuhr')).toHaveAttribute('data-mark', 'late')
    await expect(page.locator('[data-week]')).toHaveAttribute('data-week', '2:1')

    // The place never leaves the device
    expect(urls.filter((u) => u.includes('51.51') || u.includes('-0.13'))).toEqual([])
  })

  test('a prayer whose time has not begun is inert', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-10T13:00:00Z') })
    await seed(page)
    await page.goto('/prayer/tracker')
    await expect(tick(page, '2026-03-10', 'asr')).toBeDisabled()
    await expect(tick(page, '2026-03-10', 'dhuhr')).toBeEnabled()
  })

  test('after midnight, Isha still belongs to the day before and is on time', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-11T00:30:00Z') })
    await seed(page)
    await page.goto('/prayer/tracker')
    await expect(page.locator('[data-today="2026-03-10"]')).toBeVisible()
    await tick(page, '2026-03-10', 'isha').click()
    await expect(tick(page, '2026-03-10', 'isha')).toHaveAttribute('data-mark', 'ontime')
  })

  test('long-press opens On time / Late / Missed / Clear', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-10T20:00:00Z') })
    await seed(page)
    await page.goto('/prayer/tracker')
    const fajr = tick(page, '2026-03-10', 'fajr')
    await fajr.hover()
    await page.mouse.down()
    await page.waitForTimeout(700)
    await page.mouse.up()
    const sheet = page.locator('[data-mark-sheet="2026-03-10:fajr"]')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Missed' }).click()
    await expect(fajr).toHaveAttribute('data-mark', 'missed')

    // A tap on a marked prayer opens the choices rather than wiping it
    await expect(sheet).toBeHidden()
    await fajr.click()
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Clear' }).click()
    await expect(fajr).toHaveAttribute('data-mark', 'none')
  })

  test('fills a past day from the month, then makes one up', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-10T20:00:00Z') })
    await seed(page, { place: false })
    await page.goto('/prayer/tracker')

    await page.locator('[data-day="2026-03-08"]').click()
    const day = page.locator('[data-day-sheet="2026-03-08"]')
    await expect(day).toBeVisible()
    await day.locator('[data-choice="fajr:ontime"]').click()
    await day.locator('[data-choice="asr:missed"]').click()
    await expect(day.locator('[data-choice="asr:missed"]')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(day).toBeHidden()

    await expect(page.locator('[data-owed]')).toHaveAttribute('data-owed', '1')
    await page.getByRole('button', { name: 'Made one up' }).click()
    await expect(page.locator('[data-owed]')).toHaveAttribute('data-owed', '0')

    await page.reload()
    await expect(page.locator('[data-owed]')).toHaveAttribute('data-owed', '0')
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('takrar-worship') ?? '{}').state)
    expect(stored.prayers['2026-03-08']).toMatchObject({ fajr: { s: 'ontime' }, asr: { s: 'missed' } })
    expect(stored.madeUp.prayers).toBe(1)
  })

  test('the make-up list shrinks with the count, oldest first', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-10T20:00:00Z') })
    await seed(page, { place: false })
    await page.goto('/prayer/tracker')
    await page.locator('[data-day="2026-03-08"]').click()
    const day = page.locator('[data-day-sheet="2026-03-08"]')
    await day.locator('[data-choice="fajr:missed"]').click()
    await day.locator('[data-choice="isha:missed"]').click()
    await page.getByRole('button', { name: 'Done' }).click()

    await page.getByText('Which prayers (2)').click()
    await expect(page.locator('[data-to-make-up] li')).toHaveCount(2)
    await page.getByRole('button', { name: 'Made one up' }).click()
    await expect(page.locator('[data-owed]')).toHaveAttribute('data-owed', '1')
    await expect(page.getByText('Which prayers (1)')).toBeVisible()
    // Fajr was the older of the two, so Isha is what is left
    await expect(page.locator('[data-to-make-up]')).toContainText('Isha')
    await expect(page.locator('[data-to-make-up]')).not.toContainText('Fajr')
  })

  test('the day sheet holds back prayers whose time has not begun', async ({ page }) => {
    // 13:00 in London: Fajr and Dhuhr have begun; Asr, Maghrib and Isha have not
    await page.clock.install({ time: new Date('2026-03-10T13:00:00Z') })
    await seed(page)
    await page.goto('/prayer/tracker')
    await expect(page.locator('[data-today="2026-03-10"]')).toBeVisible()
    await page.locator('[data-day="2026-03-10"]').click()
    const day = page.locator('[data-day-sheet="2026-03-10"]')
    await expect(day).toBeVisible()
    await expect(day.locator('[data-not-yet="asr"]')).toBeVisible()
    await expect(day.locator('[data-not-yet="isha"]')).toBeVisible()
    await expect(day.locator('[data-choice^="asr:"]')).toHaveCount(0)
    await day.locator('[data-choice="dhuhr:ontime"]').click()
    await expect(day.locator('[data-choice="dhuhr:ontime"]')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Done' }).click()

    // A past day is open in full
    await page.locator('[data-day="2026-03-09"]').click()
    await expect(page.locator('[data-day-sheet="2026-03-09"] [data-choice="isha:ontime"]')).toBeVisible()
  })

  test('clearing a made-up mark takes the make-up back, so the next one still counts', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-10T20:00:00Z') })
    await seed(page, { place: false })
    await page.goto('/prayer/tracker')

    await page.locator('[data-day="2026-03-08"]').click()
    const day = page.locator('[data-day-sheet="2026-03-08"]')
    await day.locator('[data-choice="asr:missed"]').click()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: 'Made one up' }).click()
    await expect(page.locator('[data-owed]')).toHaveAttribute('data-owed', '0')

    // The mark is corrected to Late, then another prayer is marked
    await page.locator('[data-day="2026-03-08"]').click()
    await day.locator('[data-choice="asr:late"]').click()
    await day.locator('[data-choice="fajr:missed"]').click()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.locator('[data-owed]')).toHaveAttribute('data-owed', '1')
    const madeUp = await page.evaluate(() => JSON.parse(localStorage.getItem('takrar-worship') ?? '{}').state.madeUp.prayers)
    expect(madeUp).toBe(0)
  })

  test('month days say how much is logged', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-10T20:00:00Z') })
    await seed(page, { place: false })
    await page.goto('/prayer/tracker')
    await tick(page, '2026-03-10', 'fajr').click()
    await expect(page.locator('[data-day="2026-03-10"]')).toHaveAccessibleName(/1 of 5 logged/)
    await expect(page.locator('[data-day="2026-03-09"]')).toHaveAccessibleName(/nothing logged/)
  })

  test('without a place, a tick still logs the prayer', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-10T20:00:00Z') })
    await seed(page, { place: false })
    await page.goto('/prayer/tracker')
    await tick(page, '2026-03-10', 'maghrib').click()
    await expect(tick(page, '2026-03-10', 'maghrib')).toHaveAttribute('data-mark', 'ontime')
  })

  test('pause needs no reason, and resuming the same day leaves nothing behind', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-10T20:00:00Z') })
    await seed(page)
    await page.goto('/prayer/tracker')
    await page.locator('[data-pause]').click()
    await expect(page.locator('[data-paused-since="2026-03-10"]')).toBeVisible()
    await page.reload()
    await expect(page.locator('[data-paused-since="2026-03-10"]')).toBeVisible()
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.locator('[data-paused-since]')).toHaveCount(0)
    const pauses = await page.evaluate(() => JSON.parse(localStorage.getItem('takrar-worship') ?? '{}').state.pauses)
    expect(pauses).toEqual([])
  })

  test("pausing with today already logged starts tomorrow, so today's marks still count", async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-10T20:00:00Z') })
    await seed(page)
    await page.goto('/prayer/tracker')
    await tick(page, '2026-03-10', 'isha').click()
    await expect(page.locator('[data-week]')).toHaveAttribute('data-week', '1:1')
    await page.locator('[data-pause]').click()
    await expect(page.locator('[data-paused-since="2026-03-11"]')).toBeVisible()
    await expect(page.locator('[data-week]')).toHaveAttribute('data-week', '1:1')
    // Resuming before the pause has begun leaves nothing behind
    await page.getByRole('button', { name: 'Resume' }).click()
    const pauses = await page.evaluate(() => JSON.parse(localStorage.getItem('takrar-worship') ?? '{}').state.pauses)
    expect(pauses).toEqual([])
  })
})

test.describe('tasbih', () => {
  const counter = (page: Page) => page.locator('[data-counter] button[data-count]')

  test('counts, undoes, and keeps the count after a reload', async ({ page }) => {
    await seed(page, { place: false })
    await page.goto('/tasbih')
    for (let i = 0; i < 3; i++) await counter(page).click()
    await expect(counter(page)).toHaveAttribute('data-count', '3')
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(counter(page)).toHaveAttribute('data-count', '2')
    await page.getByRole('button', { name: '33', exact: true }).click()
    await expect(counter(page)).toHaveAccessibleName('2 of 33')

    await page.reload()
    await expect(counter(page)).toHaveAttribute('data-count', '2')
    await expect(page.getByRole('button', { name: '33', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const counts = await page.evaluate(() => JSON.parse(localStorage.getItem('quran-essentials') ?? '{}').state.counters)
    expect(counts['tasbih-free']).toBe(2)
    const totals = await page.evaluate(() => JSON.parse(localStorage.getItem('takrar-worship') ?? '{}').state.tasbihTotals)
    expect(totals['tasbih-free']).toBe(2)
  })

  test('start again asks first, and keeps the lifetime total', async ({ page }) => {
    await seed(page, { place: false })
    await page.goto('/tasbih')
    for (let i = 0; i < 4; i++) await counter(page).click()
    await page.getByRole('button', { name: 'Start again' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Start again' }).click()
    await expect(counter(page)).toHaveAttribute('data-count', '0')
    await expect(page.locator('[data-lifetime]')).toHaveAttribute('data-lifetime', '4')
  })

  test('binds an Essentials dhikr with ?d=, and an unknown id falls back to the free counter', async ({ page }) => {
    await seed(page, { place: false })
    await page.goto('/tasbih?d=dhikr-subhanallah')
    await expect(page.locator('[data-bound="dhikr-subhanallah"]')).toBeVisible()
    await counter(page).click()
    await expect(counter(page)).toHaveAccessibleName(/1 of 33/)
    const counts = await page.evaluate(() => JSON.parse(localStorage.getItem('quran-essentials') ?? '{}').state.counters)
    expect(counts['dhikr-subhanallah']).toBe(1)

    await page.goto('/tasbih?d=not-a-dhikr')
    await expect(page.locator('[data-bound]')).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Count to' })).toBeVisible()
  })

  test('works offline after a visit (static web build)', async ({ page, context, baseURL }) => {
    // The service worker stays off on localhost (providers.tsx), so use 127.0.0.1
    const origin = new URL(baseURL ?? 'http://localhost:3000')
    test.skip(origin.port === '3000', 'the dev server is not the offline build')
    if (origin.hostname === 'localhost') origin.hostname = '127.0.0.1'
    await seed(page, { place: false })
    await page.goto(new URL('/tasbih', origin).href)
    await page.evaluate(() => navigator.serviceWorker.ready)
    // A controlled load fills the caches with this page's files
    await page.reload()
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await counter(page).click()
    await page.waitForLoadState('networkidle')

    await context.setOffline(true)
    await page.reload()
    await expect(counter(page)).toHaveAttribute('data-count', '1')
    await counter(page).click()
    await expect(counter(page)).toHaveAttribute('data-count', '2')
    await context.setOffline(false)
  })
})
