import { test, expect, type Page } from '@playwright/test'

// Adhkar and duas end to end (all-in-one spec 2.7, adhkar-duas brief), on the real
// shipped decks: say a set with "Pray it now" to the end (nothing rated, nothing
// recorded), memorise an item from a deck and find its cards in the deen review,
// and carry a memorised Essentials item over to seeded deen cards.

async function seed(page: Page, extra: Record<string, string> = {}) {
  await page.addInitScript((items) => {
    localStorage.setItem('onboarding-complete', 'true')
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v)
  }, extra)
}

const deenCards = (page: Page) =>
  page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('quran-deen') ?? '{"state":{"cards":{}}}').state.cards).sort())

test.describe('adhkar and duas', () => {
  test('the index lists the decks and the sets to say now', async ({ page }) => {
    await seed(page)
    await page.goto('/adhkar')
    for (const d of ['adhkar-morning-evening', 'adhkar-after-prayer', 'adhkar-sleep-waking', 'duas-daily', 'salah-words']) {
      await expect(page.locator(`[data-deck-link="${d}"]`)).toBeVisible()
    }
    for (const s of ['morning', 'evening', 'after-prayer', 'sleep']) await expect(page.locator(`[data-set-link="${s}"]`)).toBeVisible()
  })

  test('Pray it now walks the after-prayer set to a quiet end, with nothing recorded', async ({ page }) => {
    await seed(page)
    await page.goto('/adhkar/now?set=after-prayer')
    // Step 1 is said three times: the full-width count button under the text takes the taps
    await expect(page.locator('[data-now-step="istighfar-3"]')).toBeVisible()
    await expect(page.locator('[data-now-next]')).toHaveText('Skip ahead')
    const pill = page.locator('[data-now-count]')
    for (let i = 0; i < 3; i++) await pill.click()
    await expect(pill).toHaveAttribute('data-now-count', '3')
    await expect(page.locator('[data-now-next]')).toHaveText('Next')
    // Leaving and coming back in the same session resumes the set where it was
    await page.locator('[data-now-next]').click()
    await expect(page.locator('[data-now-step="anta-al-salam"]')).toBeVisible()
    await page.goto('/adhkar')
    await page.goto('/adhkar/now?set=after-prayer')
    await expect(page.locator('[data-now-step="anta-al-salam"]')).toBeVisible()
    // The thirty-three of each come before completing the hundred, on the full counter
    for (let i = 0; i < 6 && !(await page.locator('[data-now-step="tamam-al-mia:subhanallah"]').isVisible()); i++) {
      await page.locator('[data-now-next]').click()
    }
    await expect(page.locator('[data-now-step="tamam-al-mia:subhanallah"] [data-counter]')).toBeVisible()
    // Then walk on to the end
    for (let i = 0; i < 20; i++) {
      if (await page.locator('[data-now-done]').isVisible()) break
      await page.locator('[data-now-next]').click()
    }
    await expect(page.locator('[data-now-done]')).toContainText('That is the adhkar after the prayer said.')
    // Not rated, no streak: no deen cards were made and nothing counts sets
    expect(await deenCards(page)).toEqual([])
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /adhkar/.test(k) && k !== 'takrar-adhkar-reminders'))).toEqual([])
  })

  test('the evening set shows the evening wording', async ({ page }) => {
    await seed(page)
    await page.goto('/adhkar/now?set=evening')
    for (let i = 0; i < 6 && !(await page.locator('[data-now-step="bika-asbahna"]').isVisible()); i++) {
      await page.locator('[data-now-next]').click()
    }
    await expect(page.locator('[data-now-step="bika-asbahna"] [data-step-english]')).toContainText('by You we enter the evening')
  })

  test('a deck lists its items with sources, and memorising one puts its cards in review', async ({ page }) => {
    await seed(page)
    await page.goto('/adhkar/view?d=duas-daily')
    const card = page.locator('[data-adhkar-item="rain"]')
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: /sources/i }).click()
    await expect(card.locator('[data-citation]').first()).toContainText('1032')
    await expect(card.locator('[data-review-status="source-checked"]')).toBeVisible()
    await card.locator('[data-memorise="rain"]').click()
    await expect(page).toHaveURL(/\/review\/deen\?learn=duas-daily(%3A|:)rain/)

    // Read → Build → Recall (the item has one part)
    await page.getByRole('button', { name: 'Start memorising' }).click()
    for (let guard = 0; guard < 12; guard++) {
      if (await page.locator('[data-memorise-step="recall"]').isVisible()) break
      const readAloud = page.getByRole('button', { name: 'I’ve read it aloud' })
      if (await readAloud.isVisible()) { await readAloud.click(); continue }
      const tryIt = page.getByRole('button', { name: 'Try it from memory' })
      if (await tryIt.isVisible()) { await tryIt.click(); continue }
      const show = page.getByRole('button', { name: /i’ve said it, show me/i })
      if (await show.isVisible()) { await show.click(); continue }
      const yes = page.getByRole('button', { name: /^yes/i })
      if (await yes.isVisible()) { await yes.click(); continue }
      await page.waitForTimeout(100)
    }
    await expect(page.locator('[data-memorise-step="recall"]')).toBeVisible()
    for (let guard = 0; guard < 6; guard++) {
      if (await page.getByText(/cards? added/).isVisible()) break
      await page.getByRole('button', { name: 'Show me' }).click()
      await page.getByRole('button', { name: 'Got it' }).click()
    }
    await expect(page.getByText(/cards? added/)).toBeVisible()
    const cards = await deenCards(page)
    expect(cards).toContain('duas-daily:rain:recall')

    // Just practised: its cards start tomorrow, and the Review tab says when
    await page.goto('/review')
    await expect(page.locator('[data-deen-caught-up]')).toContainText('comes back tomorrow')
  })

  test('a memorised Essentials item becomes seeded deen cards, once', async ({ page }) => {
    await seed(page, {
      'quran-essentials': JSON.stringify({ state: { memorized: { 'dua-ruku': true }, favorites: { 'dua-ruku': true }, counters: { 'dhikr-subhanallah': 12 } }, version: 1 }),
    })
    await page.goto('/adhkar')
    await expect.poll(() => deenCards(page)).toContain('salah-words:ruku:recall')
    const essentials = await page.evaluate(() => JSON.parse(localStorage.getItem('quran-essentials')!).state)
    expect(essentials.counters).toEqual({ 'dhikr-subhanallah': 12 })
    expect(essentials.favorites).toEqual({ 'dua-ruku': true })
    expect(await page.evaluate(() => localStorage.getItem('takrar-essentials-migrated-v1'))).toBe('["dua-ruku"]')
  })

  test('Key ayahs still opens; the older collections open the decks that replaced them', async ({ page }) => {
    await seed(page)
    await page.goto('/essentials/key-ayahs')
    await expect(page.getByRole('heading', { name: 'Key ayahs' })).toBeVisible()
    await page.goto('/essentials/salah-duas')
    await expect(page).toHaveURL(/\/adhkar\/view\?d=salah-words/)
    await page.goto('/essentials/tasbih')
    await expect(page).toHaveURL(/\/tasbih$/)
    await expect(page.locator('[data-tasbih-presets]').getByText('SubhanAllah')).toBeVisible()
  })

  test('the Learn tab shows each subject once', async ({ page }) => {
    await seed(page)
    await page.goto('/essentials')
    await expect(page.locator('[data-key-ayahs]')).toBeVisible()
    for (const old of ['Salah duas', 'Morning and evening adhkar', 'Tasbih and dhikr']) await expect(page.getByText(old)).toHaveCount(0)
  })

  test('the Prayer tab offers the adhkar that fit the time', async ({ page }) => {
    // Makkah, 15 June 2026 (Umm al-Qura): Fajr about 04:10, sunrise 05:38, Dhuhr 12:21, Asr 15:41.
    // Outside the Ramadan season, when the hub gives the chip's place to the Ramadan banner
    const place = { lat: 21.42, lng: 39.83, label: 'Makkah, Saudi Arabia', countryCode: 'SA', tz: 'Asia/Riyadh', source: 'city' }
    await seed(page, {
      'takrar-place': JSON.stringify({ state: { place }, version: 1 }),
      'takrar-prayer': JSON.stringify({ state: { method: 'UmmAlQura', madhab: 'standard', highLatRule: 'auto', setupDone: true, homeStrip: true }, version: 1 }),
    })
    const chips = page.locator('[data-adhkar-now-chip]')

    // After Fajr, before sunrise: the prayer's adhkar first, then the morning set
    await page.clock.setFixedTime(new Date('2026-06-15T04:45:00+03:00'))
    await page.goto('/prayer')
    await expect(chips).toHaveCount(2)
    await expect(chips.nth(0)).toContainText('After Fajr adhkar')
    await expect(chips.nth(1)).toContainText('Morning adhkar')

    // Between sunrise and Dhuhr nothing fits, and the slot leaves no DOM behind
    await page.clock.setFixedTime(new Date('2026-06-15T08:00:00+03:00'))
    await page.goto('/prayer')
    await expect(page.locator('[data-prayer-hub="times"]')).toBeVisible()
    await expect(page.locator('[data-chip="adhkar"]')).toBeEmpty()

    // Dhuhr has entered: one chip, which opens its set
    await page.clock.setFixedTime(new Date('2026-06-15T14:00:00+03:00'))
    await page.goto('/prayer')
    await expect(chips).toHaveCount(1)
    await expect(chips.first()).toContainText('After Dhuhr adhkar')
    await chips.first().click()
    await expect(page).toHaveURL(/\/adhkar\/now\?set=after-prayer/)
    await expect(page.locator('[data-now-step="istighfar-3"]')).toBeVisible()
  })

  test('the morning set opens "We have reached the morning", and an unknown set says so', async ({ page }) => {
    await seed(page)
    await page.goto('/adhkar/now?set=morning')
    for (let i = 0; i < 8 && !(await page.locator('[data-now-step="al-mulku-lillah"]').isVisible()); i++) {
      await page.locator('[data-now-next]').click()
    }
    await expect(page.locator('[data-now-step="al-mulku-lillah"] [data-step-variant]')).toContainText('In the morning')
    await expect(page.locator('[data-now-step="al-mulku-lillah"]')).toContainText('أَصْبَحْنَا')

    await page.goto('/adhkar/now?set=noon')
    await expect(page.getByText('This set isn’t here yet.')).toBeVisible()
  })
})
