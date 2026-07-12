'use client'

// Re-reads persisted state from localStorage into the live zustand stores.
// This replaces the old hard window.location.reload() after cloud downloads /
// migrations: sync writes localStorage, then rehydrates — no page flash, and
// in-memory state can no longer silently diverge from what sync just wrote.

import { useProgressStore } from '@/stores/progress-store'
import { useReviewStore } from '@/stores/review-store'
import { useStatsStore } from '@/stores/stats-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePracticeStore } from '@/stores/practice-store'
import { usePlanStore } from '@/stores/plan-store'
import { useEssentialsStore } from '@/stores/essentials-store'
import type { StoreName } from './merge'

const STORES: Record<StoreName, { persist: { rehydrate: () => unknown } }> = {
  'quran-progress': useProgressStore,
  'quran-reviews': useReviewStore,
  'quran-stats': useStatsStore,
  'quran-settings': useSettingsStore,
  'quran-practice': usePracticeStore,
  'quran-plan': usePlanStore,
  'quran-essentials': useEssentialsStore,
}

export async function rehydrateStores(names?: StoreName[]) {
  const targets = names ?? (Object.keys(STORES) as StoreName[])
  await Promise.all(targets.map((name) => STORES[name]?.persist.rehydrate()))
}
