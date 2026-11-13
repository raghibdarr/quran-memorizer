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
import { useDeenStore } from '@/stores/deen-store'
import { usePrayerStore } from '@/stores/prayer-store'
import { useWorshipStore } from '@/stores/worship-store'
import { useZakatStore } from '@/stores/zakat-store'
import type { StoreName } from './merge'

const STORES: Record<StoreName, { persist: { rehydrate: () => unknown } }> = {
  'quran-progress': useProgressStore,
  'quran-reviews': useReviewStore,
  'quran-stats': useStatsStore,
  'quran-settings': useSettingsStore,
  'quran-practice': usePracticeStore,
  'quran-plan': usePlanStore,
  'quran-essentials': useEssentialsStore,
  'quran-reader': useReaderStore,
  'quran-deen': useDeenStore,
}

/** Device-only stores that a backup import can restore (never synced) */
const DEVICE_STORES: Record<string, { persist: { rehydrate: () => unknown } }> = {
  'takrar-prayer': usePrayerStore,
  'takrar-worship': useWorshipStore,
  'takrar-zakat': useZakatStore,
}

/** Re-reads the device-only stores a backup import just wrote */
export async function rehydrateDeviceStores(names?: string[]) {
  const targets = names ?? Object.keys(DEVICE_STORES)
  await Promise.all(targets.map((name) => DEVICE_STORES[name]?.persist.rehydrate()))
}

export async function rehydrateStores(names?: StoreName[]) {
  const targets = names ?? (Object.keys(STORES) as StoreName[])
  await Promise.all(targets.map((name) => STORES[name]?.persist.rehydrate()))
}
