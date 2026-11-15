import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Foundations course (all-in-one package "course-ui"), on the fixture unit in
// src/lib/course/__fixtures__ (made-up lessons that follow the Lesson type). It
// reaches the page through the deen engine's test seam, window.__TAKRAR_TEST_DECKS__
// (src/components/deen/deck-source.ts); nothing of it is bundled into the app.
//
// Open a lesson → step through its points → the positions table shows all four
// schools → answer the questions → add the cards → they are in /review/deen →
// the lesson is marked done after a reload.

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'course', '__fixtures__', 'course-fixture.json'), 'utf8'))

async function seed(page: Page, extra: Record<string, string> = {}) {
  await page.addInitScript(
    ({ deck, extra }) => {
      localStorage.setItem('onboarding-complete', 'true')
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v)
      ;(window as unknown as { __TAKRAR_TEST_DECKS__: unknown }).__TAKRAR_TEST_DECKS__ = [
        {
          info: { id: '_course', title: 'Fixture unit', blurb: 'Made-up lessons for tests', kind: 'course', group: 'course', route: '/course', defaultDepth: 'meaning' },
          deck,
        },
      ]
    },
    { deck: fixture, extra },
  )
}

const deenState = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('quran-deen') ?? '{"state":{"cards":{},"lessonsDone":{}}}').state)

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true }).click()

test.describe('foundations course', () => {
  test('a lesson end to end with a school chosen: four positions, cards added, done after reload', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.clock.install({ time: new Date('2026-11-14T10:00:00') })
    await seed(page)

    // ---- The course page lists the fixture unit, nothing done yet
    await page.goto('/course')
    const unit = page.locator('[data-unit="_course"]')
    await expect(unit).toBeVisible()
    await expect(unit.locator('[data-unit-progress]')).toHaveText('0 of 2 done')
    await expect(page.locator('[data-review-status="source-checked"]').first()).toContainText('Source-checked. Not yet reviewed by a scholar.')
    await unit.locator('[data-lesson-row="fx-01"]').click()

    // ---- First lesson opened: the school question, once
    await expect(page).toHaveURL(/\/course\/lesson\?l=fx-01$/)
    const sheet = page.locator('[data-school-sheet]')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Maliki' }).click()
    await expect(sheet).toHaveCount(0)

    // ---- Intro, no rulings, with the status and the footer
    await expect(page.locator('[data-lesson-step="intro"]')).toContainText('Fixture: the first lesson')
    await expect(page.locator('[data-lesson-footer]')).toContainText('For your own situation, ask a scholar you trust.')
    await page.getByRole('button', { name: 'Start' }).click()

    // ---- Point 1 (agreed): the consensus chip shows its work and location
    await expect(page.locator('[data-lesson-step="claim"][data-claim="c1"]')).toBeVisible()
    await expect(page.locator('[data-term="wudu"]').first()).toBeVisible()
    await page.locator('[data-evidence-chip="consensus"]').click()
    await expect(page.locator('[data-evidence-panel="consensus"]')).toContainText('Fixture chapter, p. 1')
    await expect(page.locator('[data-lesson-footer]')).toBeVisible()
    await next(page)

    // ---- Point 2 (differs): all four schools, the chosen one first, Arabic on tap
    await expect(page.locator('[data-claim="c2"][data-claim-kind="differs"]')).toBeVisible()
    const rows = page.locator('[data-positions] li[data-school]')
    await expect(rows).toHaveCount(4)
    await expect(rows.first()).toHaveAttribute('data-school', 'maliki')
    await expect(rows.first()).toContainText('Your school')
    await rows.nth(1).getByRole('button').click()
    await expect(rows.nth(1).locator('[lang="ar"]')).toBeVisible()
    await next(page)

    // ---- Point 3: a hadith chip opens its citation; one not in the app is a plain note, not a chip
    await expect(page.locator('[data-claim="c3"]')).toBeVisible()
    const chips = page.locator('[data-evidence-chip="item"]')
    await expect(chips.first()).toContainText('1')
    await chips.first().click()
    await expect(page.locator('[data-evidence-item="fx-hadith"] [data-citation]')).toBeVisible()
    await expect(page.locator('[data-evidence-pending]')).toHaveText(/Hadith\s*reference to come/)
    await expect(chips).toHaveCount(1)
    await next(page)

    // ---- Questions: not scored; a wrong pick is shown gently with the answer
    await expect(page.locator('[data-lesson-step="check"][data-check="0"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pick an answer' })).toBeDisabled()
    await page.locator('[data-option="0"]').click()
    await expect(page.locator('[data-check-feedback]')).toContainText('Not quite. It’s “Right one”.')
    // The picked answer keeps focus (keyboard users aren't dropped to the top), and a second pick changes nothing
    await expect(page.locator('[data-option="0"]')).toBeFocused()
    await page.locator('[data-option="1"]').click({ force: true })
    await expect(page.locator('[data-option="0"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-option="1"]')).toHaveAttribute('aria-pressed', 'false')
    await next(page)
    await page.locator('[data-option="0"]').click()
    await expect(page.locator('[data-check-feedback]')).toContainText('That’s right.')
    await next(page)

    // ---- Add the cards: the general ones plus the Maliki card, not the others
    await expect(page.locator('[data-lesson-step="finish"]')).toContainText('Maliki position')
    await page.getByRole('button', { name: 'Add 4 cards to review' }).click()
    await expect(page.locator('[data-lesson-done]')).toContainText('4 cards added. They come up in Review.')
    const state = await deenState(page)
    expect(Object.keys(state.cards).sort()).toEqual(['_course:fx-01:c1a', '_course:fx-01:c2-maliki', '_course:fx-01:c2a', '_course:fx-01:c3a'])
    expect(state.school).toBe('maliki')
    expect(state.lessonsDone['fx-01']).toBeGreaterThan(0)
    await expect(page.locator('[data-next-lesson]')).toContainText('Fixture: a second lesson')

    // ---- They are in the review session
    await page.goto('/review/deen?deck=_course')
    await expect(page.getByText('Card 1 of 4')).toBeVisible()

    // ---- Done after a reload, and the continue card moves on
    await page.goto('/course')
    await page.reload()
    await expect(page.locator('[data-lesson-row="fx-01"]')).toHaveAttribute('data-done', '')
    await expect(page.locator('[data-lesson-row="fx-02"]')).not.toHaveAttribute('data-done', '')
    await expect(page.locator('[data-unit="_course"] [data-unit-progress]')).toHaveText('1 of 2 done')
    await expect(page.locator('[data-continue]')).toHaveAttribute('data-continue', 'fx-02')
    await expect(page.locator('[data-school-row]')).toContainText('Maliki')

    // ---- The school question is not asked again
    await page.locator('[data-continue]').click()
    await expect(page.locator('[data-lesson-step="intro"]')).toContainText('Fixture: a second lesson')
    await expect(page.locator('[data-school-sheet]')).toHaveCount(0)
  })

  test('"Show me all four": four rows, no school card added', async ({ page }) => {
    await seed(page)
    await page.goto('/course/lesson?l=fx-01')
    await page.locator('[data-school-sheet]').getByRole('button', { name: 'Show me all four' }).click()
    await page.getByRole('button', { name: 'Start' }).click()
    await next(page)
    const rows = page.locator('[data-positions] li[data-school]')
    await expect(rows).toHaveCount(4)
    await expect(rows.first()).toHaveAttribute('data-school', 'hanafi')
    await expect(page.getByText('Your school')).toHaveCount(0)
    await next(page)
    await next(page)
    for (let i = 0; i < 2; i++) {
      await page.locator('[data-option="1"]').click()
      await next(page)
    }
    await expect(page.locator('[data-lesson-step="finish"]')).toContainText('With no school chosen')
    await page.getByRole('button', { name: 'Add 3 cards to review' }).click()
    const state = await deenState(page)
    expect(Object.keys(state.cards).sort()).toEqual(['_course:fx-01:c1a', '_course:fx-01:c2a', '_course:fx-01:c3a'])
    expect(state.school).toBeNull()
  })

  test('a Quran chip shows the ayah and opens the reader; coming back resumes the lesson', async ({ page }) => {
    await seed(page, { 'takrar-course-school-asked': '1' })
    await page.goto('/course/lesson?l=fx-01')
    await page.getByRole('button', { name: 'Start' }).click()
    await page.locator('[data-evidence-chip="quran"]').click()
    const open = page.locator('[data-open-reader]')
    await expect(open).toHaveAttribute('href', '/listen?s=5&a=6')
    await expect(page.locator('[data-evidence-panel="quran"] .arabic-text').first()).toBeVisible()
    await open.click()
    await expect(page).toHaveURL(/\/listen\?s=5&a=6$/)
    await page.goBack()
    await expect(page.locator('[data-lesson-step="claim"][data-claim="c1"]')).toBeVisible()
  })

  test('an unknown lesson shows a calm message', async ({ page }) => {
    await seed(page)
    await page.goto('/course/lesson?l=nope')
    await expect(page.getByText("This lesson isn't available")).toBeVisible()
  })
})
