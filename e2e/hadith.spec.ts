import { test, expect, type Page } from '@playwright/test'
import { buildStage, solveOrder, walkBuild, walkRecall } from './helpers/memorise'

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
    await expect(page.getByRole('heading', { name: 'Forty Hadith', exact: true })).toBeVisible()
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

    // ---- Memorise: Read, then Build part by part, each part with its own English
    await page.locator('[data-start-memorising]').click()
    await expect(page).toHaveURL(/\/review\/deen\?learn=nawawi40%3A01&depth=arabic$/)
    await page.getByRole('button', { name: 'Start memorising' }).click()
    const flow = page.locator('[data-memorise-step="build"]')
    const arabic = { current: '' }

    // Part 1 is the narrator's opening, whole, with its piece of the translation under it
    await expect(flow).toHaveAttribute('data-stage', 'read')
    await expect(page.locator('[data-unit-label]')).toHaveText('Part 1 of 6')
    await expect(page.locator('[data-unit-arabic]')).toContainText('عُمَرَ بْنِ الْخَطَّابِ رَضِيَ اللَّهُ عَنْهُ قَالَ:')
    await expect(page.locator('[data-unit-arabic]')).not.toContainText('سَمِعْتُ')
    await expect(page.locator('[data-part-english]')).toHaveText('It is narrated from the Commander of the Believers, Abu Hafs Umar ibn al-Khattab, may Allah be pleased with him, who said:')
    await expect(page.locator('[data-build-help]')).toHaveText('Read it aloud once, with its meaning.')
    expect(await buildStage(page, arabic)).toBe('read')

    // First-letter cues, the meaning still under them
    await expect(flow).toHaveAttribute('data-stage', 'cue')
    await expect(page.locator('[data-cue-text]')).toBeVisible()
    await expect(page.locator('[data-part-english]')).toBeVisible()
    await buildStage(page, arabic)

    // Put the words in order: a wrong tile is refused, and Next waits for the row to be right
    await expect(flow).toHaveAttribute('data-stage', 'order')
    await expect(page.locator('[data-order-tiles] button')).toHaveCount(12)
    await expect(page.getByText('Tap the words below in order')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveAttribute('aria-disabled', 'true')
    await page.evaluate(() => {
      const wrong = [...document.querySelectorAll<HTMLButtonElement>('[data-order-tiles] button')].find((b) => b.textContent?.trim() === 'قَالَ')
      wrong?.click()
    })
    await expect(page.getByText('Not quite. Try again.')).toBeVisible()
    await expect(page.locator('[data-order-row] > span.arabic-text')).toHaveCount(0)
    await expect(page.getByText('Not quite. Try again.')).toHaveCount(0)
    await solveOrder(page, arabic.current)
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // From memory: the Arabic is hidden, the meaning is the prompt
    await expect(flow).toHaveAttribute('data-stage', 'hidden')
    await expect(page.getByText('Say it from memory', { exact: true })).toBeVisible()
    await expect(page.locator('[data-part-english]')).toBeVisible()
    await buildStage(page, arabic)

    // Check and rate: "Hesitated" goes over it once more (cues, then memory, no tiles), "Got it" moves on
    await expect(flow).toHaveAttribute('data-stage', 'check')
    await page.getByRole('button', { name: 'Hesitated', exact: true }).click()
    await expect(flow).toHaveAttribute('data-stage', 'cue')
    await expect(flow).toHaveAttribute('data-unit', '0')
    await buildStage(page, arabic)
    await expect(flow).toHaveAttribute('data-stage', 'hidden')
    await buildStage(page, arabic)
    await expect(page.getByRole('button', { name: 'Move on for now' })).toBeVisible()
    await page.getByRole('button', { name: 'Got it', exact: true }).click()
    await expect(flow).toHaveAttribute('data-unit', '1')

    // The rest: six parts, the parts of each paragraph together, then all of it
    const walked = await walkBuild(page)
    expect(walked.length).toBe(9)
    expect(walked[1]).toEqual(['read', 'cue', 'order', 'hidden', 'check'])
    expect(walked[3]).toEqual(['hidden', 'check'])
    expect(walked[8]).toEqual(['hidden', 'check'])

    // ---- Recall: the Arabic (rated), then its meaning and point, then its narrator
    const recallStep = page.locator('[data-memorise-step="recall"]')
    await expect(page.getByRole('heading', { name: 'Say the Arabic from memory' })).toBeVisible()
    await page.getByRole('button', { name: 'Show me' }).click()
    await page.getByRole('button', { name: 'Got it' }).click()
    await expect(page.getByRole('heading', { name: 'What does it mean, and what is its point?' })).toBeVisible()
    await expect(recallStep).not.toContainText('Actions are only by intentions')
    await page.getByRole('button', { name: 'Show me' }).click()
    await expect(recallStep).toContainText('Actions are only by intentions')
    await expect(page.locator('[data-recall-point]')).toContainText('Actions are by intentions')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Who narrated it?' })).toBeVisible()
    await expect(recallStep).not.toContainText('Umar ibn al-Khattab')
    await page.getByRole('button', { name: 'Show me' }).click()
    await expect(page.locator('[data-recall-narrator]')).toHaveText('Umar ibn al-Khattab')
    await page.getByRole('button', { name: 'Finish' }).click()
    await expect(page.getByText('3 cards added. They start coming up in Review tomorrow.')).toBeVisible()
    expect(await deenCards(page)).toEqual(['nawawi40:01:meaning', 'nawawi40:01:narrator', 'nawawi40:01:recall'])

    // ---- The list now shows it as learning
    await page.goto('/hadith')
    await expect(page.locator('[data-hadith-row="01"] [data-item-state="learning"]')).toHaveText('Learning')
    await expect(page.locator('[data-hadith-progress]')).toContainText('1 of')
    await page.locator('[data-hadith-row="01"]').click()
    await expect(page.locator('[data-start-memorising]')).toHaveText('Go through it again')

    // ---- The rating counted: nothing to rate again today, and the session says when they come
    await page.goto('/review/deen?deck=nawawi40')
    await expect(page.locator('[data-empty]').or(page.getByText('Nothing to review here right now'))).toBeVisible()
    await expect(page.getByText('The next card comes back tomorrow.')).toBeVisible()
    const recall = await page.evaluate(() => JSON.parse(localStorage.getItem('quran-deen')!).state.cards['nawawi40:01:recall'])
    expect(recall.repetitions).toBe(1)
    expect(recall.lastQuality).toBe(5)
  })

  test('"Just learn the meaning" adds only the meaning card', async ({ page }) => {
    await seed(page)
    await page.goto('/hadith/view?id=07')
    await expect(page.getByRole('heading', { name: 'The religion is sincere counsel' })).toBeVisible()
    await page.locator('[data-learn-meaning]').click()
    await expect(page).toHaveURL(/learn=nawawi40%3A07&depth=meaning$/)
    await page.getByRole('button', { name: /i’ve read it, test me/i }).click()
    // No Build: straight to the meaning (rated), then the narrator
    expect(await walkRecall(page)).toEqual(['meaning', 'narrator'])
    expect(await deenCards(page)).toEqual(['nawawi40:07:meaning'])

    // The Arabic is still to memorise, and the meaning is not offered twice
    await page.goto('/hadith/view?id=07')
    await expect(page.locator('[data-start-memorising]')).toHaveText('Start memorising')
    await expect(page.locator('[data-learn-meaning]')).toHaveCount(0)
  })

  test('hadith 11 is learned in four parts, and the narrator’s name is never cut', async ({ page }) => {
    await seed(page)
    await page.goto('/review/deen?learn=nawawi40:11&depth=arabic')
    await page.getByRole('button', { name: 'Start memorising' }).click()
    await expect(page.locator('[data-unit-label]')).toHaveText('Part 1 of 4')
    // The whole name is one part (an automatic split once ended it at "…بن أبي")
    await expect(page.locator('[data-unit-arabic] > div').first()).toHaveText('عَنْ أَبِي مُحَمَّدٍ الْحَسَنِ بْنِ عَلِيِّ بْنِ أَبِي طَالِبٍ')
    await expect(page.locator('[data-part-english]')).toHaveText('It is narrated from Abu Muhammad al-Hasan ibn Ali ibn Abi Talib,')

    const walked = await walkBuild(page)
    // Four parts, then all together (one paragraph, so no smaller chain)
    expect(walked.map((stages) => stages.length)).toEqual([5, 5, 5, 5, 2])
    expect(await walkRecall(page, 'Hesitated')).toEqual(['arabic', 'meaning', 'narrator'])
    expect(await deenCards(page)).toEqual(['nawawi40:11:meaning', 'nawawi40:11:narrator', 'nawawi40:11:recall'])
    const recall = await page.evaluate(() => JSON.parse(localStorage.getItem('quran-deen')!).state.cards['nawawi40:11:recall'])
    expect(recall.lastQuality).toBe(3)
  })

  test('a hadith that is not in the deck says so calmly', async ({ page }) => {
    await seed(page)
    // A number al-Nawawi gave, still being checked
    await page.goto('/hadith/view?id=20')
    await expect(page.locator('[data-hadith-missing="not-yet"]')).toContainText("This hadith isn't here yet")
    // A number he never gave
    await page.goto('/hadith/view?id=99')
    await expect(page.locator('[data-hadith-missing="no-such"]')).toContainText('There is no hadith with that number')
    await page.getByRole('link', { name: 'See all the hadith' }).click()
    await expect(page).toHaveURL(/\/hadith$/)
  })
})
