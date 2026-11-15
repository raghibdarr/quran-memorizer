import { test, expect, type Page } from '@playwright/test'

// The Forty Hadith screens (hadith-nawawi40 package, all-in-one spec 2.2 and 2.7) on the
// real emitted deck: the list shows each hadith's state, a hadith opens with its Arabic,
// translation, source and status, memorising it adds its cards, and they show in the
// deen review session. Nothing is seeded but the onboarding flag.

async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-complete', 'true')
  })
}

const deenCards = (page: Page) =>
  page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('quran-deen') ?? '{"state":{"cards":{}}}').state.cards).sort())

test.describe('Forty Hadith', () => {
  test('open hadith 1, memorise it, and its cards come up in review', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-14T10:00:00') })
    await seed(page)

    // ---- The list
    await page.goto('/hadith')
    await expect(page.getByRole('heading', { name: 'The Forty Hadith of al-Nawawi' })).toBeVisible()
    const row = page.locator('[data-hadith-row="01"]')
    await expect(row).toContainText('Actions are by intentions')
    await expect(row.locator('[data-item-state="new"]')).toHaveText('Not started')
    expect(await page.locator('[data-hadith-row]').count()).toBeGreaterThanOrEqual(15)

    // ---- One hadith
    await row.click()
    await expect(page).toHaveURL(/\/hadith\/view\?id=01$/)
    await expect(page.getByRole('heading', { name: 'Actions are by intentions' })).toBeVisible()
    await expect(page.locator('[data-hadith-arabic]')).toContainText('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ')
    await expect(page.locator('[data-hadith-translation]')).toContainText('Actions are only by intentions')
    await expect(page.locator('[data-citation]').first()).toContainText('Sahih al-Bukhari 1')
    await expect(page.locator('[data-citation]').nth(1)).toContainText('Sahih Muslim 1907')
    await expect(page.locator('[data-grading="in-sahih"]').first()).toBeVisible()
    await expect(page.locator('[data-review-status="source-checked"]')).toContainText('Source-checked. Not yet reviewed by a scholar.')

    // ---- Memorise: Read, then Build (three authored parts, then all together), then Recall
    await page.locator('[data-start-memorising]').click()
    await expect(page).toHaveURL(/\/review\/deen\?learn=nawawi40%3A01&depth=arabic$/)
    await page.getByRole('button', { name: 'Start memorising' }).click()
    for (let unit = 0; unit < 4; unit++) {
      await expect(page.locator(`[data-memorise-step="build"][data-unit="${unit}"]`)).toBeVisible()
      if (unit < 3) {
        for (let r = 0; r < 3; r++) await page.getByRole('button', { name: 'I’ve read it aloud' }).click()
      }
      await page.getByRole('button', { name: 'Try it from memory' }).click()
      await page.getByRole('button', { name: /i’ve said it, show me/i }).click()
      await page.getByRole('button', { name: /^yes/i }).click()
    }
    await expect(page.locator('[data-memorise-step="recall"]')).toBeVisible()
    await page.getByRole('button', { name: 'Show me' }).click()
    await page.getByRole('button', { name: 'Got it' }).click()
    await expect(page.getByText('3 cards added. They come up in Review.')).toBeVisible()
    expect(await deenCards(page)).toEqual(['nawawi40:01:meaning', 'nawawi40:01:narrator', 'nawawi40:01:recall'])

    // ---- The list now shows it as learning
    await page.goto('/hadith')
    await expect(page.locator('[data-hadith-row="01"] [data-item-state="learning"]')).toHaveText('Learning')
    await expect(page.locator('[data-hadith-progress]')).toContainText('1 of')

    // ---- And the cards are in the deen review session
    await page.goto('/review/deen?deck=nawawi40')
    await expect(page.getByText('Card 1 of 3')).toBeVisible()
    await page.getByRole('button', { name: 'Show me' }).click()
    await page.getByRole('button', { name: 'Got it' }).click()
    await expect(page.getByText('Card 2 of 3')).toBeVisible()
  })

  test('"Just learn the meaning" adds only the meaning card', async ({ page }) => {
    await seed(page)
    await page.goto('/hadith/view?id=07')
    await expect(page.getByRole('heading', { name: 'The religion is sincere counsel' })).toBeVisible()
    await page.locator('[data-learn-meaning]').click()
    await expect(page).toHaveURL(/learn=nawawi40%3A07&depth=meaning$/)
    await page.getByRole('button', { name: /i’ve read it, test me/i }).click()
    await page.getByRole('button', { name: 'Show me' }).click()
    await page.getByRole('button', { name: 'Got it' }).click()
    expect(await deenCards(page)).toEqual(['nawawi40:07:meaning'])
  })

  test('a hadith that is not in the deck says so calmly', async ({ page }) => {
    await seed(page)
    await page.goto('/hadith/view?id=99')
    await expect(page.locator('[data-hadith-missing]')).toContainText("This hadith isn't here yet")
    await page.getByRole('link', { name: 'See the hadith that are ready' }).click()
    await expect(page).toHaveURL(/\/hadith$/)
  })
})
