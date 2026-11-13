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
import { useReaderStore } from '@/stores/reader-store'
import type { StoreName } from './merge'

type Rehydratable = { persist: { rehydrate: () => unknown } }

// The all-in-one stores load lazily, so Home's first load doesn't carry them. A
// store whose module hasn't loaded yet has no live copy to refresh: importing it
// here creates it, and it hydrates from what sync just wrote.
const STORES: Record<StoreName, Rehydratable | (() => Promise<Rehydratable>)> = {
  'quran-progress': useProgressStore,
  'quran-reviews': useReviewStore,
  'quran-stats': useStatsStore,
  'quran-settings': useSettingsStore,
  'quran-practice': usePracticeStore,
  'quran-plan': usePlanStore,
  'quran-essentials': useEssentialsStore,
  'quran-reader': useReaderStore,
  'quran-deen': () => import('@/stores/deen-store').then((m) => m.useDeenStore),
}

/** Device-only stores that a backup import can restore (never synced) */
const DEVICE_STORES: Record<string, () => Promise<Rehydratable>> = {
  'takrar-prayer': () => import('@/stores/prayer-store').then((m) => m.usePrayerStore),
  'takrar-worship': () => import('@/stores/worship-store').then((m) => m.useWorshipStore),
  'takrar-zakat': () => import('@/stores/zakat-store').then((m) => m.useZakatStore),
}

async function rehydrateOne(entry: Rehydratable | (() => Promise<Rehydratable>) | undefined) {
  if (!entry) return
  // A zustand store is itself a function (the hook), so tell them apart by `persist`
  const store = 'persist' in entry ? entry : await entry()
  await store.persist.rehydrate()
}

/** Re-reads the device-only stores a backup import just wrote */
export async function rehydrateDeviceStores(names?: string[]) {
  const targets = names ?? Object.keys(DEVICE_STORES)
  await Promise.all(targets.map((name) => rehydrateOne(DEVICE_STORES[name])))
}

export async function rehydrateStores(names?: StoreName[]) {
  const targets = names ?? (Object.keys(STORES) as StoreName[])
  await Promise.all(targets.map((name) => rehydrateOne(STORES[name])))
}
