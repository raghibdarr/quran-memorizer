import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// The deen engine end to end (all-in-one spec 2.5, 2.7, 5.6), on the fixture
// deck: memorise an item → its cards show in the Review section → rate them →
// they leave today → they come back when the clock moves on. Plus the term sheet
// in place, and /sources and /glossary offline.
//
// The fixture deck (content/deen/_fixture, three made-up items) is built here
// with the real build script into a temp folder and handed to the page through
// the engine's test seam, window.__TAKRAR_TEST_DECKS__ (src/components/deen/
// deck-source.ts). Nothing of it is bundled into the app.

let fixtureDeck: unknown

test.beforeAll(() => {
  const out = mkdtempSync(join(tmpdir(), 'takrar-deen-'))
  try {
    // The build script is an ES module: run it in its own node process
    const script = [
      "import { build } from './scripts/build-deen.mjs'",
      "const res = build(undefined, { decks: ['_fixture'], includeFixture: true, outDir: process.argv[1], writeLock: false })",
      'if (res.errors.length) { console.error(JSON.stringify(res.errors)); process.exit(1) }',
    ].join('\n')
    execFileSync(process.execPath, ['--input-type=module', '-e', script, out], { cwd: join(__dirname, '..'), stdio: 'inherit' })
    fixtureDeck = JSON.parse(readFileSync(join(out, '_fixture.json'), 'utf8'))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

async function seed(page: Page) {
  await page.addInitScript((deck) => {
    localStorage.setItem('onboarding-complete', 'true')
    ;(window as unknown as { __TAKRAR_TEST_DECKS__: unknown }).__TAKRAR_TEST_DECKS__ = [
      {
        info: { id: '_fixture', title: 'Fixture deck', blurb: 'Test items', kind: 'hadith', group: 'hadith', route: '/hadith', defaultDepth: null },
        deck,
      },
    ]
  }, fixtureDeck)
}

const deenCards = (page: Page) =>
  page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('quran-deen') ?? '{"state":{"cards":{}}}').state.cards).sort())

test.describe('deen engine', () => {
  test('memorise an item, review its cards, see them come back', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-13T10:00:00') })
    await seed(page)

    // ---- Learn: Read
    await page.goto('/review/deen?learn=_fixture:01')
    // The fixture deck asks for a depth (defaultDepth null)
    await page.getByRole('button', { name: /memorise the arabic/i }).click()
    await expect(page.getByRole('heading', { name: 'Fixture: a sound item' })).toBeVisible()
    await expect(page.locator('[data-citation]').first()).toContainText('Fixture sahih 1')
    await expect(page.locator('[data-review-status="source-checked"]')).toContainText('Source-checked. Not yet reviewed by a scholar.')

    // A term opens in place, and can be learned
    const url = page.url()
    await page.locator('[data-term="dhikr"]').first().click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Remembering Allah', { exact: false })).toBeVisible()
    expect(page.url()).toBe(url)
    await sheet.getByRole('button', { name: 'Learn this term' }).click()
    await expect(sheet.getByText('Added. It comes up in your reviews.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

    // ---- Build: two authored parts, then both chained
    await page.getByRole('button', { name: 'Start memorising' }).click()
    for (let unit = 0; unit < 3; unit++) {
      await expect(page.locator(`[data-memorise-step="build"][data-unit="${unit}"]`)).toBeVisible()
      if (unit < 2) {
        for (let r = 0; r < 3; r++) await page.getByRole('button', { name: 'I’ve read it aloud' }).click()
      }
      await expect(page.locator('[data-cue-text]')).toBeVisible()
      await page.getByRole('button', { name: 'Try it from memory' }).click()
      await page.getByRole('button', { name: /i’ve said it, show me/i }).click()
      await page.getByRole('button', { name: /^yes/i }).click()
    }

    // ---- Recall and self-rate
    await expect(page.locator('[data-memorise-step="recall"]')).toBeVisible()
    await page.getByRole('button', { name: 'Show me' }).click()
    await page.getByRole('button', { name: 'Got it' }).click()
    await expect(page.getByText('3 cards added. They come up in Review.')).toBeVisible()
    expect(await deenCards(page)).toEqual(['_fixture:01:meaning', '_fixture:01:narrator', '_fixture:01:recall', 'glossary:dhikr:term'])

    // ---- The Review tab shows them
    await page.goto('/review')
    const section = page.locator('[data-deen-review-section]')
    await expect(section).toBeVisible()
    await expect(section.locator('[data-deck-row="_fixture"]')).toContainText('3 new')
    await expect(section.locator('[data-deck-row="glossary"]')).toContainText('1 new')
    await section.locator('[data-deen-start]').click()

    // ---- Rate every card
    await expect(page).toHaveURL(/\/review\/deen$/)
    for (let i = 0; i < 4; i++) {
      await expect(page.getByText(`Card ${i + 1} of 4`)).toBeVisible()
      await page.getByRole('button', { name: 'Show me' }).click()
      await page.getByRole('button', { name: 'Got it' }).click()
    }
    await expect(page.getByText('4 cards reviewed')).toBeVisible()
    await expect(page.getByText('The next one comes back tomorrow.')).toBeVisible()

    // ---- They leave today
    await page.goto('/review')
    await expect(page.locator('[data-deen-caught-up]')).toContainText('All done for today. The next card comes back tomorrow.')

    // ---- And come back when the day moves on
    await page.clock.setSystemTime(new Date('2026-11-15T09:00:00'))
    await page.reload()
    await expect(page.locator('[data-deen-review-section] [data-deck-row="_fixture"]')).toContainText('3 due')
    await expect(page.locator('[data-deen-start]')).toContainText('Start · 4 cards')
  })

  test('"Know the meaning" skips Build and adds only the meaning card', async ({ page }) => {
    await seed(page)
    await page.goto('/review/deen?learn=_fixture:03&depth=meaning')
    await expect(page.getByRole('heading', { name: 'Fixture: a graded item' })).toBeVisible()
    await expect(page.locator('[data-grading="hasan"]')).toContainText('Fixture scholar')
    await page.getByRole('button', { name: /i’ve read it, test me/i }).click()
    await expect(page.getByText('What does it mean?', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Show me' }).click()
    await page.getByRole('button', { name: 'Hesitated' }).click()
    await expect(page.getByText('1 card added.', { exact: false })).toBeVisible()
    expect(await deenCards(page)).toEqual(['_fixture:03:meaning'])
  })

  test('a learn link to a deck that is not a text deck shows a calm message, not a crash', async ({ page }) => {
    await page.addInitScript((deck) => {
      localStorage.setItem('onboarding-complete', 'true')
      ;(window as unknown as { __TAKRAR_TEST_DECKS__: unknown }).__TAKRAR_TEST_DECKS__ = [
        { info: { id: '_fixture', title: 'Fixture names', blurb: '', kind: 'names', group: 'names', route: '/names', defaultDepth: 'meaning' }, deck },
      ]
    }, fixtureDeck)
    await page.goto('/review/deen?learn=_fixture:01')
    await expect(page.getByText("This text isn't available")).toBeVisible()
    await page.goto('/review/deen?learn=_fixture:nope')
    await expect(page.getByText("This text isn't available")).toBeVisible()
  })

  test('the Learn tab lists live decks only', async ({ page }) => {
    // Without the fixture every registry deck is still { ready: false }: no rows
    await page.addInitScript(() => localStorage.setItem('onboarding-complete', 'true'))
    await page.goto('/essentials')
    await expect(page.getByRole('heading', { name: 'Memorisation plans' })).toBeVisible()
    await expect(page.locator('[data-learn-rows]')).toHaveCount(0)
    await page.close()
  })

  test('the Learn tab shows a ready deck with its progress', async ({ page }) => {
    await seed(page)
    await page.goto('/essentials')
    const row = page.locator('[data-learn-row="hadith"]')
    await expect(row).toBeVisible()
    await expect(row).toContainText('0/3')
  })

  test('/glossary searches and opens a term; /sources shows the method', async ({ page }) => {
    await seed(page)
    await page.goto('/glossary')
    await page.getByRole('searchbox', { name: 'Search terms' }).fill("da'if")
    await page.locator('[data-term-row="daif"] button').first().click()
    await expect(page.getByText('Weak: the grading', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Learn this term' })).toBeVisible()

    await page.goto('/sources#method')
    await expect(page.getByRole('heading', { name: 'How each text is checked' })).toBeVisible()
    await expect(page.locator('[data-reviewers-empty]')).toHaveText('No scholar has reviewed this yet. We will name them here when one does.')
    await expect(page.getByRole('link', { name: 'Notices and licences' })).toHaveAttribute('href', '/licenses.txt')
  })

  test('/sources and /glossary work after an offline reload', async ({ page, context }, testInfo) => {
    // The service worker is the web's offline path (the apps carry the bundle);
    // it stays off on "localhost", so use the loopback address
    test.skip(testInfo.project.name !== 'web', 'static web hosting only')
    const base = new URL(testInfo.project.use.baseURL ?? 'http://localhost')
    base.hostname = '127.0.0.1'
    await seed(page)
    for (const path of ['/glossary', '/sources']) {
      await page.goto(new URL(path, base).href)
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready
      })
      await page.reload() // now under the worker, which caches the page and its assets
    }
    await page.goto(new URL('/glossary', base).href)
    await expect(page.locator('[data-term-row="wudu"]')).toBeVisible()

    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('[data-term-row="wudu"]')).toBeVisible()
    await page.goto(new URL('/sources', base).href)
    await expect(page.getByRole('heading', { name: 'What “source-checked” means' })).toBeVisible()
    await context.setOffline(false)
  })
})
