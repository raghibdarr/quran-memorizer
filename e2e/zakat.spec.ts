import { test, expect, type Request } from '@playwright/test'

// Zakat calculator (all-in-one package "zakat"): fill, result on both bases,
// positions chosen by the user, reload persists, and nothing entered ever
// leaves the device (prices are typed in; there is no feed).

const CASH = '2345.67'
const CURRENCY = 'ZKT'

test.describe('zakat', () => {
  test('fill, result, reload persists, nothing sent', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-01T10:00:00'))
    const sent: string[] = []
    page.on('request', (r: Request) => sent.push(`${r.url()} ${r.postData() ?? ''}`))

    await page.goto('/zakat')
    await expect(page.getByRole('heading', { name: 'Zakat', exact: true })).toBeVisible()
    await expect(page.getByTestId('zakat-result')).toContainText('Enter what you have')

    await page.getByTestId('zakat-currency').fill(CURRENCY)
    await page.getByTestId('zakat-price-gold').fill('70')
    await page.getByTestId('zakat-price-silver').fill('0.8')
    await page.getByTestId('zakat-cash').fill(CASH)

    // Both bases shown: above silver nisab (595 g × 0.8 = 476), below gold (85 g × 70 = 5,950)
    await expect(page.locator('[data-nisab="silver"]')).toContainText('476.00 ZKT')
    await expect(page.locator('[data-nisab="gold"]')).toContainText('5,950.00 ZKT')
    await expect(page.getByTestId('zakat-due')).toHaveText('58.64 ZKT')
    await expect(page.getByTestId('zakat-headline')).toContainText('Zakat due, measured against silver')
    await expect(page.getByTestId('zakat-headline')).toContainText('2.5% of 2,345.67 ZKT')
    await expect(page.getByTestId('zakat-other-basis')).toHaveText('On the gold basis nothing is due: its nisab is 5,950.00 ZKT.')
    // Screen readers hear the whole outcome as a sentence
    await expect(page.getByText('On the silver basis, zakat on 2,345.67 ZKT is 58.64 ZKT.')).toBeAttached()

    // Switching the basis switches the headline
    await page.getByRole('tab', { name: 'Gold' }).click()
    await expect(page.getByTestId('zakat-headline')).toContainText('Measured against gold')
    await expect(page.getByTestId('zakat-headline')).toContainText('No zakat due')
    await page.getByRole('tab', { name: 'Silver' }).click()

    // Debts need the user's choice between positions before they count
    await page.getByTestId('zakat-debts').fill('2000')
    await expect(page.getByTestId('zakat-result')).toContainText('Choose whether to take your debts off')
    await expect(page.locator('[data-note="debts"]')).toHaveAttribute('open', '')
    await page.getByRole('radio', { name: 'Take them off', exact: true }).click()
    await expect(page.getByTestId('zakat-headline')).toContainText('345.67 ZKT is below the silver nisab of 476.00 ZKT')
    await page.getByRole('radio', { name: 'Leave them in' }).click()
    await expect(page.getByTestId('zakat-due')).toHaveText('58.64 ZKT')

    // Zakat year: the next lunar anniversary, labelled expected
    await page.getByTestId('zakat-hawl').fill('2026-01-10')
    await expect(page.getByTestId('zakat-next-hawl')).toContainText('expected to complete on')
    await expect(page.getByTestId('zakat-next-hawl')).toContainText(/December 2026/)
    await expect(page.getByText('Reminders need the app.')).toBeVisible()

    // Reload: everything is remembered on the device
    await page.reload()
    await expect(page.getByTestId('zakat-cash')).toHaveValue(CASH)
    await expect(page.getByTestId('zakat-price-silver')).toHaveValue('0.8')
    await expect(page.getByTestId('zakat-due')).toHaveText('58.64 ZKT')
    await expect(page.getByRole('radio', { name: 'Leave them in' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('zakat-hawl')).toHaveValue('2026-01-10')
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('takrar-zakat') ?? '{}').state)
    expect(stored).toMatchObject({ inputs: { cash: 2345.67, debts: 2000 }, currency: CURRENCY, hawlStartIso: '2026-01-10' })

    // Nothing the user typed went anywhere
    for (const s of sent) {
      expect(s).not.toContain(CURRENCY)
      expect(s).not.toContain('2345')
      expect(s).not.toContain('2026-01-10')
    }
  })

  test('worn jewellery waits for a choice and shows both positions', async ({ page }) => {
    await page.goto('/zakat')
    await page.getByTestId('zakat-price-gold').fill('70')
    await page.getByTestId('zakat-price-silver').fill('0.8')
    await page.getByTestId('zakat-goldWornGrams').fill('10')
    await expect(page.getByTestId('zakat-result')).toContainText('Choose whether to count the jewellery you wear')
    const note = page.locator('[data-note="worn-jewellery"]')
    await expect(note).toContainText('Hanafi')
    await expect(note).toContainText("Maliki, Shafi'i, Hanbali")
    await expect(note).toContainText('Not yet reviewed by a scholar')
    await page.getByRole('radio', { name: 'Count it' }).click()
    await expect(page.getByTestId('zakat-due')).toHaveText('17.50') // 10 g × 70 = 700 ≥ 476; 2.5%
    await page.getByRole('radio', { name: 'Leave it out' }).click()
    await expect(page.getByTestId('zakat-headline')).toContainText('No zakat due')
  })

  test('an amount that does not read as one holds the result back', async ({ page }) => {
    await page.goto('/zakat')
    await page.getByTestId('zakat-price-silver').fill('0.8')
    await page.getByTestId('zakat-cash').fill('900')
    await expect(page.getByTestId('zakat-due')).toHaveText('22.50')
    await page.getByTestId('zakat-cash').fill('12abc')
    await expect(page.getByTestId('zakat-due')).toHaveCount(0)
    const fix = page.getByRole('button', { name: 'Fix the amount in Cash and savings.' })
    await expect(fix).toBeVisible()
    await fix.click()
    await expect(page.getByTestId('zakat-cash')).toBeFocused()
    await page.getByTestId('zakat-cash').fill('-5')
    await expect(page.getByText('Enter an amount of 0 or more.')).toBeVisible()
    await page.getByTestId('zakat-cash').fill('900')
    await expect(page.getByTestId('zakat-due')).toHaveText('22.50')
  })
})

test.describe('zakat: edge cases', () => {
  test('an amount with two readings says which one was taken', async ({ page }) => {
    await page.goto('/zakat')
    await page.getByTestId('zakat-goldGrams').fill('8,125')
    await expect(page.getByTestId('zakat-goldGrams-read')).toHaveText('Read as 8,125 g')
    await page.getByTestId('zakat-goldGrams').fill('8,12')
    await expect(page.getByTestId('zakat-goldGrams-read')).toHaveCount(0)
  })

  test('a start date the Hijri calendar cannot place says so', async ({ page }) => {
    await page.goto('/zakat')
    await page.getByTestId('zakat-hawl').fill('0001-01-01')
    await expect(page.getByTestId('zakat-hawl-problem')).toBeVisible()
    await expect(page.getByTestId('zakat-next-hawl')).toHaveCount(0)
    await expect(page.getByText(', expected', { exact: true })).toHaveCount(0)
  })
})
