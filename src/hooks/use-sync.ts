'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import {
  STORE_NAMES,
  FLAGS_STORE,
  STORE_SCHEMA_VERSIONS,
  WRITE_ENVELOPE,
  planStoreMerge,
  readPayload,
  encodeCloudRow,
  type SyncRowName,
  type StoreName,
} from '@/lib/sync/merge'
import {
  getRowLocal,
  setRowLocal,
  stateHash,
  getLastSyncedHashes,
  setLastSyncedHashes,
  setLastSyncedAt,
  getSeenMarkers,
  setSeenMarker,
  clearSeenMarkers,
} from '@/lib/sync/local'
import { rehydrateStores } from '@/lib/sync/rehydrate'

// Sync engine (M2 hardened): pure merge logic lives in src/lib/sync/merge.ts;
// this hook is the IO orchestrator. Pushes are compare-and-set on a `rev`
// column (see supabase/migrations/002_user_data_rev.sql): a stale push updates
// zero rows, and the store is re-fetched, re-merged and retried instead of
// clobbering another device's write. Enveloped payloads carry their
// schemaVersion; an older client never merges or overwrites a newer client's
// data (this release still WRITES bare state — see WRITE_ENVELOPE). Cloud
// downloads REHYDRATE the zustand stores in place — no window.location.reload().
// "Is the cloud newer?" is answered by per-row SEEN MARKERS (src/lib/sync/local.ts).

const SYNC_ROWS: SyncRowName[] = [...STORE_NAMES, FLAGS_STORE]
const MAX_CAS_RETRIES = 2

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

interface CloudRow {
  payload: ReturnType<typeof readPayload>
  rev: number
  updated_at: string
}

let warnedLegacyRev = false
const warnedNewerSchema = new Set<string>()

export function useSync(user: User | null) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const supabaseRef = useRef(createClient())
  const syncingRef = useRef(false)
  const initialSyncDone = useRef(false)
  // Falls to false when the DB lacks the rev column (migration not applied yet)
  const casSupportedRef = useRef(true)

  const fetchCloudRows = useCallback(async (names?: SyncRowName[]): Promise<Map<string, CloudRow>> => {
    const supabase = supabaseRef.current
    let query = supabase.from('user_data').select('store_name, data, updated_at, rev').eq('user_id', user!.id)
    if (names && names.length) query = query.in('store_name', names)
    const { data, error } = await query
    if (error) {
      // Missing rev column → legacy mode (migration 002 not applied yet)
      if (error.code === '42703' || /column .*rev/i.test(error.message ?? '')) {
        casSupportedRef.current = false
        if (!warnedLegacyRev) {
          warnedLegacyRev = true
          console.warn('[sync] user_data.rev column missing — apply supabase/migrations/002_user_data_rev.sql; falling back to non-CAS upserts')
        }
        const legacy = await supabase.from('user_data').select('store_name, data, updated_at').eq('user_id', user!.id)
        if (legacy.error) throw legacy.error
        return new Map((legacy.data ?? []).map((row) => [
          row.store_name,
          { payload: readPayload(row.data as Record<string, unknown>), rev: 0, updated_at: row.updated_at },
        ]))
      }
      throw error
    }
    return new Map((data ?? []).map((row) => [
      row.store_name,
      { payload: readPayload(row.data as Record<string, unknown>), rev: (row as { rev?: number }).rev ?? 0, updated_at: row.updated_at },
    ]))
  }, [user])

  /**
   * One merge+push pass over the given rows. Returns row names that hit a CAS
   * conflict (another device wrote between our read and write).
   */
  const syncPass = useCallback(async (names: SyncRowName[], cloudRows: Map<string, CloudRow>): Promise<SyncRowName[]> => {
    const supabase = supabaseRef.current
    const userId = user!.id
    const seen = getSeenMarkers(userId)
    const hashes = getLastSyncedHashes()
    const changedLocal: StoreName[] = []
    const uploads: Array<{ name: SyncRowName; state: Record<string, unknown>; expectedRev: number | null }> = []

    for (const name of names) {
      const local = getRowLocal(name)
      const cloudRow = cloudRows.get(name) ?? null
      const cloud = cloudRow?.payload ?? null

      const marker = seen[name]
      const cloudIsNewer = !!cloudRow && (
        !marker ||
        (casSupportedRef.current ? cloudRow.rev !== marker.rev : cloudRow.updated_at !== marker.updatedAt)
      )

      const plan = planStoreMerge({ storeName: name, local, cloud, cloudIsNewer })

      if (plan.blockedByNewerSchema) {
        if (!warnedNewerSchema.has(name)) {
          warnedNewerSchema.add(name)
          console.warn(`[sync] ${name}: cloud data written by a newer app version — leaving it untouched (update this device)`)
        }
        continue
      }

      if (plan.newLocal) {
        setRowLocal(name, plan.newLocal)
        if (name !== FLAGS_STORE) changedLocal.push(name as StoreName)
      }

      // This cloud version is now part of local state
      if (cloudRow && cloudIsNewer) {
        setSeenMarker(userId, name, { rev: cloudRow.rev, updatedAt: cloudRow.updated_at })
      }

      if (plan.upload) {
        const h = stateHash(plan.upload)
        const cloudMatches = !!cloudRow?.payload && stateHash(cloudRow.payload.state) === h
        // A pre-release enveloped row gets rewritten in this release's format
        const needsRewrite = !WRITE_ENVELOPE && (cloudRow?.payload?.schemaVersion ?? 0) > 0
        // Skip unchanged stores (dirty check) — but always create a missing cloud row
        if (cloudRow && cloudMatches && !needsRewrite) {
          hashes[name] = h
          continue
        }
        uploads.push({ name, state: plan.upload, expectedRev: cloudRow ? cloudRow.rev : null })
      }
    }
    setLastSyncedHashes(hashes)

    // Load merged data into the live stores BEFORE any network await: a user
    // action during the uploads would otherwise persist the pre-merge in-memory
    // state over the merged copy we just wrote to localStorage.
    if (changedLocal.length) await rehydrateStores(changedLocal)

    // Push with compare-and-set. After each successful write the marker moves
    // to the version WE wrote; a conflict leaves it alone, so the next pass sees
    // the other device's version as newer and merges it.
    const conflicts: SyncRowName[] = []
    for (const up of uploads) {
      const data = encodeCloudRow(up.state, STORE_SCHEMA_VERSIONS[up.name])
      let written: { rev?: number | null; updated_at: string } | null = null

      if (!casSupportedRef.current) {
        const { data: rows, error } = await supabase.from('user_data').upsert(
          { user_id: userId, store_name: up.name, data },
          { onConflict: 'user_id,store_name' }
        ).select('updated_at')
        if (error) throw error
        written = rows?.[0] ?? null
      } else if (up.expectedRev === null) {
        const { data: rows, error } = await supabase.from('user_data')
          .insert({ user_id: userId, store_name: up.name, data, rev: 1 })
          .select('rev, updated_at')
        if (error) {
          if (error.code === '23505') { conflicts.push(up.name); continue } // someone inserted first
          throw error
        }
        written = rows?.[0] ?? null
      } else {
        const { data: rows, error } = await supabase.from('user_data')
          .update({ data, rev: up.expectedRev + 1 })
          .eq('user_id', userId)
          .eq('store_name', up.name)
          .eq('rev', up.expectedRev)
          .select('rev, updated_at')
        if (error) throw error
        if (!rows || rows.length === 0) { conflicts.push(up.name); continue } // stale rev
        written = rows[0]
      }

      if (written) {
        setSeenMarker(userId, up.name, { rev: written.rev ?? 0, updatedAt: written.updated_at })
      }
      const hashesNow = getLastSyncedHashes()
      hashesNow[up.name] = stateHash(up.state)
      setLastSyncedHashes(hashesNow)
    }

    return conflicts
  }, [user])

  /** Full smart sync: merge every row; retry CAS conflicts with fresh cloud state. */
  const smartSync = useCallback(async () => {
    if (!user) return
    let names = SYNC_ROWS
    for (let attempt = 0; attempt <= MAX_CAS_RETRIES; attempt++) {
      const cloudRows = await fetchCloudRows(attempt === 0 ? undefined : names)
      const conflicts = await syncPass(names, cloudRows)
      if (conflicts.length === 0) break
      names = conflicts
    }
    // No blanket "mark everything as seen" refresh here: markers only ever
    // advance to versions this device merged or wrote (see syncPass).
    setLastSyncedAt(Date.now())
  }, [user, fetchCloudRows, syncPass])

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

  // Initial sync on sign-in. smartSync covers every shape (fresh device pulls
  // cloud into local + rehydrates; fresh account uploads local) — no reload.
  useEffect(() => {
    if (!user || initialSyncDone.current) return
    initialSyncDone.current = true
    sync()
  }, [user, sync])

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

  // Reset when user signs out. Only on a real signed-in → signed-out transition:
  // `user` is also null for the moment before auth loads on every app start,
  // and wiping the markers then would treat every row as foreign on cold start.
  const prevUserIdRef = useRef<string | null>(null)
  useEffect(() => {
    const wasSignedIn = prevUserIdRef.current !== null
    prevUserIdRef.current = user?.id ?? null
    if (!user) {
      initialSyncDone.current = false
      setStatus('idle')
      // Signed-out edits must be MERGED on the next sign-in, not assumed current
      if (wasSignedIn) clearSeenMarkers()
    }
  }, [user])

  return { status, sync }
}
