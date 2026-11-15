import { test, expect } from '@playwright/test'

// Android's system font scale reaches the WebView: at 200% text the dense grids
// must still fit the screen (no sideways scroll, day numbers not run together).

test.describe('large text', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const route of ['/calendar', '/prayer/tracker']) {
    test(`${route} fits at 200% text`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('onboarding-complete', 'true')
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.style.fontSize = '200%'
        })
      })
      await page.clock.install({ time: new Date('2026-11-15T10:00:00') })
      await page.goto(route)
      await expect(page.locator('main').first()).toBeVisible()
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })
      // Let layout settle after the size change
      await page.waitForTimeout(300)
      const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
      expect(scroll).toBeLessThanOrEqual(client)
    })
  }
})
