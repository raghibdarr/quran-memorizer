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
    // Step 1 is said three times: the counter takes the taps
    await expect(page.locator('[data-now-step="istighfar-3"]')).toBeVisible()
    await expect(page.locator('[data-now-next]')).toHaveText('Skip ahead')
    const counter = page.locator('[data-counter] button[data-count]')
    for (let i = 0; i < 3; i++) await counter.click()
    await expect(counter).toHaveAttribute('data-count', '3')
    await expect(page.locator('[data-now-next]')).toHaveText('Next')
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
    await expect(page.locator('[data-now-step="bika-asbahna"] [data-step-variant]')).toContainText('In the evening')
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

    await page.goto('/review')
    await expect(page.locator('[data-deen-review-section] [data-deck-row="duas-daily"]')).toBeVisible()
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

  test('Essentials collections still open, with numbered sources', async ({ page }) => {
    await seed(page)
    for (const id of ['key-ayahs', 'tasbih', 'salah-duas']) {
      await page.goto(`/essentials/${id}`)
      await expect(page.locator('main, body').first()).not.toContainText('couldn’t load')
    }
    await page.goto('/essentials/tasbih')
    await expect(page.getByText('SubhanAllah').first()).toBeVisible()
  })
})
