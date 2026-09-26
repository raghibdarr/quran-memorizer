import { test, expect, type Page } from '@playwright/test'

// THE app-wide smoke (M2): cold load → walk a lesson's phases with stubbed
// audio → reload → progress persisted → a due review session opens. Deliberately
// ONE spec — it's a regression net, not a test suite (decision log §6.4).

async function stubAudio(page: Page) {
  // External recitation audio is aborted; the AudioController swallows load
  // failures by design, so phases behave as if playback completed.
  await page.route(/everyayah\.com|qurancdn\.com|tarteel\.ai/, (route) => route.abort())
}

test.describe('smoke', () => {
  test('lesson flow persists across reload', async ({ page }) => {
    await stubAudio(page)
    // First-run overlays (onboarding, Build explainer) are out of smoke scope
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-complete', 'true')
      localStorage.setItem('chunk-explainer-seen', 'true')
    })

    // Cold load straight into Al-Ikhlas lesson 1 (avoids the home onboarding overlay)
    await page.goto('/learn?s=112&l=1')
    await expect(page.getByText('Listen & Absorb')).toBeVisible()

    // → Understand
    await page.getByRole('button', { name: /skip to understand/i }).click()
    await expect(page.getByRole('heading', { name: 'Understand' })).toBeVisible()

    // Word tiles work: tapping a word swaps the plaque prompt for the meaning
    const prompt = page.getByText(/tap any word above/i)
    await expect(prompt).toBeVisible()
    await page.locator('button.tactile-chip .arabic-text, button.tactile-chip .tajweed-text').first().click()
    await expect(prompt).toBeHidden()

    // → Build → Test
    await page.getByRole('button', { name: /skip to build/i }).click()
    await expect(page.getByText(/listen & repeat aloud/i)).toBeVisible()
    await page.getByRole('button', { name: /skip to test/i }).click()
    await expect(page.getByText(/level 1: fill in the missing word/i)).toBeVisible()

    // Reload: the lesson must resume at the persisted phase (localStorage)
    await page.reload()
    await expect(page.getByText(/level 1: fill in the missing word/i)).toBeVisible()
  })

  test('a due review opens a session via the plan deep-link', async ({ page }) => {
    await stubAudio(page)

    // Seed a completed lesson with a DUE review card (persisted-store shapes —
    // golden fixtures in src/lib/sync/fixtures.test.ts pin these)
    await page.addInitScript(() => {
      localStorage.setItem('quran-reviews', JSON.stringify({
        version: 1,
        state: {
          cards: [
            { surahId: 112, ayahNumber: 1, easeFactor: 2.5, interval: 1, repetitions: 1, nextReview: 1, lastReview: 1, lastQuality: 4 },
          ],
          lessonCards: [
            { lessonId: '112-1', surahId: 112, lessonNumber: 1, ayahStart: 1, ayahEnd: 4, easeFactor: 2.5, interval: 1, repetitions: 1, nextReview: 1, lastReview: 1, lastQuality: 4 },
          ],
        },
      }))
      localStorage.setItem('lesson-review-migration-v4', '1')
      localStorage.setItem('onboarding-complete', 'true')
    })

    await page.goto('/review?start=1')
    // The ?start=1 deep link must auto-open the session on the due card
    await expect(page.getByText('Review Session')).toBeVisible()
    await expect(page.getByText(/exit review/i)).toBeVisible()
  })

  test('a long overdue queue runs in capped batches with a continue/stop break (M5)', async ({ page }) => {
    await stubAudio(page)
    // 12 overdue one-ayah lessons — more than one batch of 10
    await page.addInitScript(() => {
      const DAY = 864e5
      const now = Date.now()
      const ids = [103, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 97]
      localStorage.setItem('quran-reviews', JSON.stringify({
        version: 2,
        state: {
          cards: [],
          lessonCards: ids.map((s, i) => ({
            lessonId: `${s}-1`, surahId: s, lessonNumber: 1, ayahStart: 1, ayahEnd: 1,
            easeFactor: 2.5, interval: 7, repetitions: 3, nextReview: now - (i + 2) * DAY,
            lastReview: now - 30 * DAY, lastQuality: 4,
          })),
        },
      }))
      localStorage.setItem('lesson-review-migration-v4', '1')
      localStorage.setItem('onboarding-complete', 'true')
    })

    await page.goto('/review?start=1')
    await expect(page.getByText('Card 1 of 10')).toBeVisible()
    await expect(page.getByText('· 12 due')).toBeVisible()

    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: /rate my recall/i }).click()
      await page.getByRole('button', { name: 'Got it' }).click()
      await page.getByRole('button', { name: 'Submit Review' }).click()
      await page.getByRole('button', { name: i < 9 ? 'Next Lesson' : 'Finish Batch' }).click()
    }

    // The break: explicit framing, ratings already saved, a real choice
    await expect(page.getByText('Batch done — 10 of 12 reviewed')).toBeVisible()
    await expect(page.getByText(/2 more due · 2 overdue/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Stop for today' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue with 2 more' }).click()
    await expect(page.getByText('Card 1 of 2')).toBeVisible()
  })

  test('finishing the last plan task shows the day-complete moment exactly once (M6)', async ({ page }) => {
    await stubAudio(page)
    // Today's new lesson is already done; one recent review remains
    await page.addInitScript(() => {
      if (localStorage.getItem('e2e-seeded')) return // seed once — reload must keep real state
      localStorage.setItem('e2e-seeded', '1')
      const DAY = 864e5
      const now = Date.now()
      const d = new Date()
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const done = (id: string, s: number, ts: number) =>
        ({ lessonId: id, surahId: s, currentPhase: 'complete', phaseData: {}, startedAt: ts - 6e5, completedAt: ts })
      localStorage.setItem('onboarding-complete', 'true')
      localStorage.setItem('lesson-review-migration-v4', '1')
      localStorage.setItem('quran-progress', JSON.stringify({ version: 2, state: { lessons: {
        '112-1': done('112-1', 112, now - 60_000),
        '114-1': done('114-1', 114, now - 3 * DAY),
      } } }))
      localStorage.setItem('quran-reviews', JSON.stringify({ version: 2, state: { cards: [], lessonCards: [
        { lessonId: '114-1', surahId: 114, lessonNumber: 1, ayahStart: 1, ayahEnd: 2, easeFactor: 2.5, interval: 1, repetitions: 1, nextReview: now - DAY, lastReview: now - 2 * DAY, lastQuality: 4 },
      ] } }))
      localStorage.setItem('quran-stats', JSON.stringify({ version: 3, state: {
        currentStreak: 11, longestStreak: 11, totalAyahsMemorized: 20, lastActiveDate: today,
        dailyActivities: 1, dailyActivityDate: today, activityLog: { [today]: 1 },
        streakFreezes: 0, frozenDates: {}, lastActivity: null, dayCompleteCelebratedOn: null,
      } }))
      localStorage.setItem('quran-plan', JSON.stringify({ version: 1, state: { plan: {
        id: 'p1', createdAt: now - DAY, goalType: 'surah', goalSurahIds: [112, 113, 114], goalJuzNumbers: [],
        deadline: null, knownSurahIds: [], knownTracking: true, knownLessonIds: [], lessonsPerDay: 1,
        studyDays: [0, 1, 2, 3, 4, 5, 6], completedLessonIds: ['112-1'], revisionFrequencyDays: 7,
        lastRevisedAt: { 114: now - 3 * DAY }, catchUpDate: null, catchUpBonus: 0, finishCelebrated: false,
      } } }))
    })

    await page.goto('/')
    await expect(page.getByText('1 task left')).toBeVisible()
    const moment = page.getByRole('dialog', { name: /today's plan done/i })
    await expect(moment).toHaveCount(0) // not before the last task

    await page.getByText('Review 1 recent lesson').click()
    await page.getByRole('button', { name: /rate my recall/i }).click()
    for (const rate of await page.getByRole('button', { name: 'Got it' }).all()) await rate.click()
    await page.getByRole('button', { name: 'Submit Review' }).click()
    await page.getByRole('button', { name: 'Finish Review' }).click()

    // Back on Home (plan deep-link returns there): the moment, tied to streak + tomorrow
    await expect(moment).toBeVisible()
    await expect(moment.getByText('Day 11 streak')).toBeVisible()
    await expect(moment.getByText(/tomorrow/i)).toBeVisible()
    await moment.getByRole('button', { name: 'Alhamdulillah' }).click()
    await expect(moment).toHaveCount(0)

    // Replay-guarded: never again today
    await page.reload()
    await expect(page.getByText('All done for today')).toBeVisible()
    await expect(moment).toHaveCount(0)
  })
})
