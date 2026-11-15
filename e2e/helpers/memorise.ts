import { expect, type Page } from '@playwright/test'
import { orderBank, orderWords } from '../../src/lib/deen/parts'

// Walking the memorise flow (src/components/deen/memorise-flow.tsx) the way a
// learner does. Buttons locked by the tap guard carry aria-disabled, which
// Playwright waits out, so every click here lands on a live control.

const build = (page: Page) => page.locator('[data-memorise-step="build"]')

/** The Arabic of the part on screen (read, cue and check stages keep it in the DOM) */
export async function partArabic(page: Page): Promise<string> {
  return ((await page.locator('[data-unit-arabic] > div').first().textContent()) ?? '').replace(/\s+/g, ' ').trim()
}

/** Put the tiles in order: the right tile for each place, taken from the part's own Arabic */
export async function solveOrder(page: Page, arabic: string) {
  const bank = orderBank(orderWords(arabic))
  if (!bank) throw new Error(`no tiles expected for "${arabic}"`)
  for (const word of bank.bank) {
    const placed = await page.locator('[data-order-row] > span.arabic-text').count()
    await page.evaluate((w) => {
      const tile = [...document.querySelectorAll<HTMLButtonElement>('[data-order-tiles] button')].find((b) => !b.disabled && b.textContent?.trim() === w)
      if (!tile) throw new Error(`no free tile "${w}"`)
      tile.click()
    }, word)
    await expect(page.locator('[data-order-row] > span.arabic-text')).toHaveCount(placed + 1)
  }
  await expect(page.locator('[data-word-order][data-solved]')).toBeVisible()
}

/** One stage of the unit on screen; returns the stage it acted on */
export async function buildStage(page: Page, arabic: { current: string }, rate: 'Got it' | 'Hesitated' | 'Missed' = 'Got it'): Promise<string> {
  const stage = (await build(page).getAttribute('data-stage')) ?? ''
  if (stage === 'read') {
    arabic.current = await partArabic(page)
    await page.getByRole('button', { name: 'I’ve read it aloud' }).click()
  } else if (stage === 'cue') {
    await page.getByRole('button', { name: 'I’ve said it', exact: true }).click()
  } else if (stage === 'order') {
    await solveOrder(page, arabic.current)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
  } else if (stage === 'hidden') {
    await page.getByRole('button', { name: 'I’ve said it, show me' }).click()
  } else if (stage === 'check') {
    await page.getByRole('button', { name: rate, exact: true }).click()
  }
  return stage
}

/** Every Build unit from where the flow stands, rating each "Got it", until Recall shows. Returns the stages walked, per unit. */
export async function walkBuild(page: Page): Promise<string[][]> {
  const arabic = { current: '' }
  const walked: string[][] = []
  const recall = page.locator('[data-memorise-step="recall"]')
  for (let guard = 0; guard < 400; guard++) {
    if (await recall.isVisible()) return walked
    if (!(await build(page).isVisible())) {
      await page.waitForTimeout(50)
      continue
    }
    const unit = Number(await build(page).getAttribute('data-unit'))
    const stage = await buildStage(page, arabic)
    const list = (walked[unit] ??= [])
    if (list[list.length - 1] !== stage) list.push(stage)
    // Let the stage change land before reading it again
    await expect
      .poll(async () => (await recall.isVisible()) || `${await build(page).getAttribute('data-unit')}:${await build(page).getAttribute('data-stage')}` !== `${unit}:${stage}` || stage === 'read')
      .toBeTruthy()
  }
  throw new Error('the Build step did not end')
}

/** The Recall questions in turn: show each answer, rate the first, then on to the end. Returns the questions asked. */
export async function walkRecall(page: Page, rate: 'Got it' | 'Hesitated' | 'Missed' = 'Got it'): Promise<string[]> {
  const recall = page.locator('[data-memorise-step="recall"]')
  const asked: string[] = []
  await expect(recall).toBeVisible()
  for (let guard = 0; guard < 8; guard++) {
    if (!(await recall.isVisible())) break
    const question = (await recall.getAttribute('data-recall')) ?? ''
    asked.push(question)
    await page.getByRole('button', { name: 'Show me' }).click()
    const rating = page.getByRole('button', { name: rate, exact: true })
    const onward = page.getByRole('button', { name: /^(Next|Finish)$/ })
    await expect(rating.or(onward)).toBeVisible()
    if (await rating.isVisible()) await rating.click()
    else await onward.click()
    await expect.poll(async () => !(await recall.isVisible()) || (await recall.getAttribute('data-recall')) !== question).toBeTruthy()
  }
  await expect(page.locator('[data-memorise-step="done"]')).toBeVisible()
  return asked
}
