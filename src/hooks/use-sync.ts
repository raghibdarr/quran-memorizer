'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, SupabaseClient } from '@supabase/supabase-js'

// Helper to bypass missing DB type generation — user_data table has: user_id, store_name, data (jsonb), updated_at
function fromUserData(supabase: SupabaseClient) {
  return supabase.from('user_data') as any
}

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

const STORE_NAMES = [
  'quran-progress',
  'quran-reviews',
  'quran-stats',
  'quran-settings',
  'quran-practice',
] as const

type StoreName = typeof STORE_NAMES[number]

// --- localStorage helpers ---

function getLocalData(storeName: StoreName): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(storeName)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return (parsed.state ?? parsed) as Record<string, unknown>
  } catch {
    return null
  }
}

function setLocalData(storeName: StoreName, data: unknown) {
  try {
    const existing = localStorage.getItem(storeName)
    if (existing) {
      const parsed = JSON.parse(existing)
      parsed.state = data
      localStorage.setItem(storeName, JSON.stringify(parsed))
    } else {
      localStorage.setItem(storeName, JSON.stringify({ state: data, version: 0 }))
    }
  } catch {
    // ignore
  }
}

// --- Per-store merge logic ---

/**
 * Merge progress stores: merge lesson-by-lesson, keeping whichever
 * has more advancement (later phase or completedAt set).
 */
function mergeProgress(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  const localLessons = (local.lessons ?? {}) as Record<string, Record<string, unknown>>
  const cloudLessons = (cloud.lessons ?? {}) as Record<string, Record<string, unknown>>

  const phaseOrder = ['listen', 'understand', 'chunk', 'test', 'complete']
  const merged: Record<string, Record<string, unknown>> = { ...cloudLessons }

  for (const [id, localLesson] of Object.entries(localLessons)) {
    const cloudLesson = cloudLessons[id]
    if (!cloudLesson) {
      merged[id] = localLesson
      continue
    }

    // If either is completed, keep the completed one
    if (localLesson.completedAt && !cloudLesson.completedAt) {
      merged[id] = localLesson
    } else if (!localLesson.completedAt && cloudLesson.completedAt) {
      merged[id] = cloudLesson
    } else if (localLesson.completedAt && cloudLesson.completedAt) {
      // Both completed — keep the earlier completion (more history)
      merged[id] = (localLesson.completedAt as number) <= (cloudLesson.completedAt as number)
        ? localLesson : cloudLesson
    } else {
      // Neither completed — keep whichever is further along
      const localPhase = phaseOrder.indexOf(localLesson.currentPhase as string)
      const cloudPhase = phaseOrder.indexOf(cloudLesson.currentPhase as string)
      merged[id] = localPhase >= cloudPhase ? localLesson : cloudLesson
    }
  }

  return { ...local, lessons: merged }
}

/**
 * Merge review cards: per ayah (surahId:ayahNumber), keep the one
 * with the most recent lastReview timestamp.
 */
function mergeReviews(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  const localCards = (local.cards ?? []) as Array<Record<string, unknown>>
  const cloudCards = (cloud.cards ?? []) as Array<Record<string, unknown>>

  const cardMap = new Map<string, Record<string, unknown>>()

  // Add cloud cards first
  for (const card of cloudCards) {
    const key = `${card.surahId}:${card.ayahNumber}`
    cardMap.set(key, card)
  }

  // Merge local cards — keep whichever has more reviews or later review
  for (const card of localCards) {
    const key = `${card.surahId}:${card.ayahNumber}`
    const existing = cardMap.get(key)
    if (!existing) {
      cardMap.set(key, card)
    } else {
      // Keep the card with more repetitions, or if equal, the later lastReview
      const localReps = (card.repetitions as number) ?? 0
      const cloudReps = (existing.repetitions as number) ?? 0
      if (localReps > cloudReps) {
        cardMap.set(key, card)
      } else if (localReps === cloudReps) {
        const localTime = (card.lastReview as number) ?? 0
        const cloudTime = (existing.lastReview as number) ?? 0
        if (localTime > cloudTime) cardMap.set(key, card)
      }
    }
  }

  // Merge lesson-level review cards
  const localLessonCards = (local.lessonCards ?? []) as Array<Record<string, unknown>>
  const cloudLessonCards = (cloud.lessonCards ?? []) as Array<Record<string, unknown>>

  const lessonCardMap = new Map<string, Record<string, unknown>>()

  for (const card of cloudLessonCards) {
    lessonCardMap.set(card.lessonId as string, card)
  }

  for (const card of localLessonCards) {
    const id = card.lessonId as string
    const existing = lessonCardMap.get(id)
    if (!existing) {
      lessonCardMap.set(id, card)
    } else {
      const localReps = (card.repetitions as number) ?? 0
      const cloudReps = (existing.repetitions as number) ?? 0
      if (localReps > cloudReps) {
        lessonCardMap.set(id, card)
      } else if (localReps === cloudReps) {
        const localTime = (card.lastReview as number) ?? 0
        const cloudTime = (existing.lastReview as number) ?? 0
        if (localTime > cloudTime) lessonCardMap.set(id, card)
      }
    }
  }

  return {
    ...local,
    cards: Array.from(cardMap.values()),
    lessonCards: Array.from(lessonCardMap.values()),
  }
}

/**
 * Merge stats: keep higher streaks, sum totals where appropriate,
 * keep the more recent lastActiveDate and lastActivity.
 */
function mergeStats(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  // Pick the more recent daily activity data
  const localDate = (local.dailyActivityDate as string) ?? '';
  const cloudDate = (cloud.dailyActivityDate as string) ?? '';
  const dailyActivityDate = localDate >= cloudDate ? localDate : cloudDate;
  const dailyActivities = localDate >= cloudDate
    ? (local.dailyActivities as number) ?? 0
    : (cloud.dailyActivities as number) ?? 0;

  return {
    currentStreak: Math.max((local.currentStreak as number) ?? 0, (cloud.currentStreak as number) ?? 0),
    longestStreak: Math.max((local.longestStreak as number) ?? 0, (cloud.longestStreak as number) ?? 0),
    totalAyahsMemorized: Math.max((local.totalAyahsMemorized as number) ?? 0, (cloud.totalAyahsMemorized as number) ?? 0),
    lastActiveDate: [local.lastActiveDate, cloud.lastActiveDate]
      .filter(Boolean)
      .sort()
      .pop() ?? null,
    dailyActivities,
    dailyActivityDate: dailyActivityDate || null,
    lastActivity: pickMoreRecent(
      local.lastActivity as Record<string, unknown> | null,
      cloud.lastActivity as Record<string, unknown> | null
    ),
  }
}

function pickMoreRecent(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!a) return b
  if (!b) return a
  return ((a.timestamp as number) ?? 0) >= ((b.timestamp as number) ?? 0) ? a : b
}

/**
 * Merge practice sessions: union by session id, no duplicates.
 */
function mergePractice(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  const localSessions = (local.sessions ?? []) as Array<Record<string, unknown>>
  const cloudSessions = (cloud.sessions ?? []) as Array<Record<string, unknown>>

  const seen = new Set<string>()
  const merged: Array<Record<string, unknown>> = []

  for (const session of [...cloudSessions, ...localSessions]) {
    const id = session.id as string
    if (!seen.has(id)) {
      seen.add(id)
      merged.push(session)
    }
  }

  // Sort by timestamp descending
  merged.sort((a, b) => ((b.timestamp as number) ?? 0) - ((a.timestamp as number) ?? 0))

  return { ...local, sessions: merged }
}

/**
 * Merge settings: cloud wins for settings (most recently saved device wins),
 * unless local has been modified more recently (tracked via updated_at comparison).
 * For simplicity: cloud wins since it was explicitly synced from another device.
 */
function mergeSettings(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
  cloudIsNewer: boolean
): Record<string, unknown> {
  return cloudIsNewer ? cloud : local
}

/** Dispatch to the right merge function per store */
function mergeStore(
  storeName: StoreName,
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
  cloudIsNewer: boolean
): Record<string, unknown> {
  switch (storeName) {
    case 'quran-progress': return mergeProgress(local, cloud)
    case 'quran-reviews': return mergeReviews(local, cloud)
    case 'quran-stats': return mergeStats(local, cloud)
    case 'quran-practice': return mergePractice(local, cloud)
    case 'quran-settings': return mergeSettings(local, cloud, cloudIsNewer)
  }
}

// --- Sync hook ---

// Persist cloud timestamps in sessionStorage to survive reloads
function getCloudTimestamps(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem('sync-timestamps')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function setCloudTimestamps(ts: Record<string, string>) {
  try {
    sessionStorage.setItem('sync-timestamps', JSON.stringify(ts))
  } catch { /* ignore */ }
}

export function useSync(user: User | null) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const supabaseRef = useRef(createClient())
  const syncingRef = useRef(false)
  const initialSyncDone = useRef(false)

  function saveTimestamps(ts: Record<string, string>) {
    setCloudTimestamps(ts)
  }

  const uploadAll = useCallback(async () => {
    if (!user) return
    const supabase = supabaseRef.current

    const rows = STORE_NAMES.map((storeName) => ({
      user_id: user.id,
      store_name: storeName,
      data: getLocalData(storeName) ?? {},
    }))

    const { error } = await fromUserData(supabase)
      .upsert(rows, { onConflict: 'user_id,store_name' })

    if (error) throw error

    // Update timestamps after upload
    const { data } = await fromUserData(supabase)
      .select('store_name, updated_at')
      .eq('user_id', user.id)
    if (data) {
      const ts = getCloudTimestamps()
      for (const row of data) {
        ts[row.store_name] = row.updated_at
      }
      saveTimestamps(ts)
    }
  }, [user])

  const downloadAll = useCallback(async (): Promise<boolean> => {
    if (!user) return false
    const supabase = supabaseRef.current

    const { data, error } = await fromUserData(supabase)
      .select('store_name, data, updated_at')
      .eq('user_id', user.id)

    if (error) throw error
    if (!data || data.length === 0) return false

    const ts = getCloudTimestamps()
    for (const row of data) {
      const storeName = row.store_name as StoreName
      if (STORE_NAMES.includes(storeName) && row.data) {
        setLocalData(storeName, row.data)
        ts[storeName] = row.updated_at
      }
    }
    saveTimestamps(ts)

    return true
  }, [user])

  /**
   * Smart sync: download cloud data, merge per-store, then upload merged result.
   * No page reload — Zustand picks up localStorage changes on next render.
   */
  const smartSync = useCallback(async () => {
    if (!user) return
    const supabase = supabaseRef.current

    // 1. Fetch cloud data
    const { data: cloudRows, error } = await fromUserData(supabase)
      .select('store_name, data, updated_at')
      .eq('user_id', user.id)

    if (error) throw error

    const cloudMap = new Map<string, { data: Record<string, unknown>; updated_at: string }>()
    if (cloudRows) {
      for (const row of cloudRows) {
        cloudMap.set(row.store_name, { data: row.data as Record<string, unknown>, updated_at: row.updated_at })
      }
    }

    // 2. Merge each store
    const mergedRows: Array<{ user_id: string; store_name: string; data: unknown }> = []
    const ts = getCloudTimestamps()

    for (const storeName of STORE_NAMES) {
      const local = getLocalData(storeName)
      const cloudEntry = cloudMap.get(storeName)

      if (!local && !cloudEntry) continue

      if (!local && cloudEntry) {
        setLocalData(storeName, cloudEntry.data)
        ts[storeName] = cloudEntry.updated_at
        continue
      }

      if (local && !cloudEntry) {
        mergedRows.push({ user_id: user.id, store_name: storeName, data: local })
        continue
      }

      // Both have data — check if cloud changed since last sync
      const lastKnown = ts[storeName]
      const cloudIsNewer = !lastKnown || cloudEntry!.updated_at > lastKnown

      if (cloudIsNewer) {
        const merged = mergeStore(storeName, local!, cloudEntry!.data, true)
        setLocalData(storeName, merged)
        mergedRows.push({ user_id: user.id, store_name: storeName, data: merged })
      } else {
        mergedRows.push({ user_id: user.id, store_name: storeName, data: local })
      }
    }

    // 3. Upload merged data
    if (mergedRows.length > 0) {
      const { error: upsertError } = await fromUserData(supabase)
        .upsert(mergedRows, { onConflict: 'user_id,store_name' })
      if (upsertError) throw upsertError
    }

    // 4. Update timestamps
    const { data: updatedRows } = await fromUserData(supabase)
      .select('store_name, updated_at')
      .eq('user_id', user.id)
    if (updatedRows) {
      for (const row of updatedRows) {
        ts[row.store_name] = row.updated_at
      }
    }
    saveTimestamps(ts)
  }, [user])

  const hasCloudData = useCallback(async (): Promise<boolean> => {
    if (!user) return false
    const supabase = supabaseRef.current

    const { count, error } = await fromUserData(supabase)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (error) throw error
    return (count ?? 0) > 0
  }, [user])

  const hasLocalData = useCallback((): boolean => {
    return STORE_NAMES.some((name) => {
      const data = getLocalData(name)
      if (!data || typeof data !== 'object') return false
      const obj = data as Record<string, unknown>
      if ('lessons' in obj && typeof obj.lessons === 'object' && Object.keys(obj.lessons as object).length > 0) return true
      if ('cards' in obj && Array.isArray(obj.cards) && obj.cards.length > 0) return true
      if ('totalAyahsMemorized' in obj && (obj.totalAyahsMemorized as number) > 0) return true
      if ('sessions' in obj && Array.isArray(obj.sessions) && obj.sessions.length > 0) return true
      return false
    })
  }, [])

  // Sync function — smart merge then upload
  const sync = useCallback(async () => {
    if (!user || syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setStatus('syncing')

    try {
      await smartSync()
      setStatus('synced')
    } catch {
      setStatus('error')
    } finally {
      syncingRef.current = false
    }
  }, [user, smartSync])

  // Initial sync on sign-in — only case that reloads (new device with empty local)
  useEffect(() => {
    if (!user || initialSyncDone.current) return
    initialSyncDone.current = true

    // Guard: if we just reloaded for initial download, don't reload again
    const reloadKey = `sync-reloaded-${user.id}`
    const alreadyReloaded = sessionStorage.getItem(reloadKey)

    const doInitialSync = async () => {
      setStatus('syncing')
      try {
        const cloudExists = await hasCloudData()
        const localExists = hasLocalData()

        if (cloudExists && !localExists && !alreadyReloaded) {
          // Cloud has data, local is empty — download and reload once
          await downloadAll()
          sessionStorage.setItem(reloadKey, '1')
          window.location.reload()
        } else if (!cloudExists && localExists) {
          await uploadAll()
          setStatus('synced')
        } else if (cloudExists && localExists) {
          await smartSync()
          setStatus('synced')
        } else {
          setStatus('idle')
        }
      } catch {
        setStatus('error')
      }
    }

    doInitialSync()
  }, [user, hasCloudData, hasLocalData, downloadAll, uploadAll, smartSync])

  // Periodic sync every 30 seconds
  useEffect(() => {
    if (!user) return
    const interval = setInterval(sync, 30_000)
    return () => clearInterval(interval)
  }, [user, sync])

  // Sync on visibility change (tab refocus)
  useEffect(() => {
    if (!user) return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [user, sync])

  // Sync when coming back online
  useEffect(() => {
    if (!user) return
    const handleOnline = () => sync()
    const handleOffline = () => setStatus('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [user, sync])

  // Reset when user signs out
  useEffect(() => {
    if (!user) {
      initialSyncDone.current = false
      setCloudTimestamps({})
      setStatus('idle')
    }
  }, [user])

  return { status, sync }
}
