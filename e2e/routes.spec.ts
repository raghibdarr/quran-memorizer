import { test, expect } from '@playwright/test'
import { ALL_IN_ONE_ROUTES } from '../src/lib/routes'

// Every all-in-one route (spec 2.2) cold-loads to its own screen: under the dev
// server, Netlify-style static hosting (web) and Capacitor-style hosting
// (native: every path serves the ROOT index.html, and Home hands off to the
// real route client-side). A route that landed on Home instead would fail here.

test.describe('all-in-one routes cold-load', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('onboarding-complete', 'true'))
  })

  for (const route of ALL_IN_ONE_ROUTES) {
    test(route, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, '\/')}(\?.*)?$`), { timeout: 15_000 })
      // Not Home under the wrong address
      await expect(page.getByText('Quran Memorization')).toHaveCount(0)
      await expect(page.locator('h1, [data-stub-page], main').first()).toBeVisible()
    })
  }
})
