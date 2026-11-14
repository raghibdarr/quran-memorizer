import { test, expect, type Page } from '@playwright/test'

// The Names of Allah (names99 package, all-in-one spec 2.2, 5.7, 6): the screen
// lists all 99 with list-only Names labelled; a Name opens its sheet with its
// evidence and a reference that opens the reader; "Start learning" brings in five
// Names, and their cards appear in the deen review session.

async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-complete', 'true')
  })
}

const deenCards = (page: Page) =>
  page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('quran-deen') ?? '{"state":{"cards":{}}}').state.cards).sort())

test.describe('names of Allah', () => {
  test('lists the 99 Names and labels the list-only ones', async ({ page }) => {
    await seed(page)
    await page.goto('/names')
    await expect(page.locator('[data-name-tile]')).toHaveCount(99)
    await expect(page.locator('[data-list-only]')).toHaveCount(8)
    await expect(page.locator('[data-name-tile="023"] [data-list-only]')).toBeVisible()
    await expect(page.locator('[data-name-tile="023"]')).toHaveAccessibleName(/Found in the list only/)

    // The intro card says where the list comes from
    await page.getByRole('button', { name: /how this list came to us/i }).click()
    await expect(page.locator('[data-names-intro]')).toContainText('gharib')
    await expect(page.locator('[data-names-intro] [data-citation]')).toHaveCount(3)

    // A Name's sheet: evidence, a reference into the reader, the review status
    await page.locator('[data-name-tile="006"]').click()
    const sheet = page.locator('[data-name-sheet="006"]')
    await expect(sheet).toContainText('As-Salaam')
    await expect(sheet.locator('[data-evidence="quran-name"]')).toContainText('Named in the Quran')
    await expect(sheet.locator('[data-review-status="source-checked"]')).toContainText('Not yet reviewed by a scholar')
    await sheet.locator('[data-quran-ref="59:23"]').click()
    await expect(page).toHaveURL(/\/listen\?s=59&a=23/)
  })

  test('start learning brings in five Names, and their cards are in the review session', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-14T10:00:00') })
    await seed(page)
    await page.goto('/names')
    await expect(page.locator('[data-names-learn]')).toContainText('0 of 99 started')

    await page.locator('[data-names-start]').click()
    await expect(page.locator('[data-names-started="5"]')).toBeVisible()
    await expect(page.locator('[data-names-today="5"]')).toBeVisible()
    expect(await deenCards(page)).toEqual(['names99:001:ar-en', 'names99:002:ar-en', 'names99:003:ar-en', 'names99:004:ar-en', 'names99:005:ar-en'])
    await expect(page.locator('[data-name-tile="001"]')).not.toHaveAttribute('data-state', 'new')
    await expect(page.locator('[data-name-tile="006"]')).toHaveAttribute('data-state', 'new')

    await expect(page.locator('[data-names-learn]')).toContainText('5 new Names today. They are waiting in your reviews.')

    // Memorise the Arabic adds the other direction for the started Names; the
    // daily new-card number holds half of the ten cards for a later day, and the
    // screen says so instead of offering more
    await page.getByRole('tab', { name: 'Memorise the Arabic' }).click()
    await expect.poll(() => deenCards(page)).toHaveLength(10)
    await expect(page.locator('[data-names-ready="5"][data-names-waiting="5"]')).toContainText('the rest follow on the coming days')
    await expect(page.locator('[data-names-more]')).toHaveCount(0)

    // The cards show in the deen session, Names first in list order
    await page.locator('[data-names-review]').click()
    await expect(page).toHaveURL(/\/review\/deen\?deck=names99/)
    const card = page.locator('[data-deen-card]')
    await expect(card).toHaveAttribute('data-deen-card', /^names99:001:/)
    await expect(card).toContainText('What does this Name mean?')
  })
})
