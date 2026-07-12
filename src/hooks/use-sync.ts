'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import {
  STORE_NAMES,
  FLAGS_STORE,
  STORE_SCHEMA_VERSIONS,
  planStoreMerge,
  readPayload,
  wrapPayload,
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
  getCloudTimestamps,
  setCloudTimestamps,
} from '@/lib/sync/local'
import { rehydrateStores } from '@/lib/sync/rehydrate'

// Sync engine (M2 hardened): pure merge logic lives in src/lib/sync/merge.ts;
// this hook is the IO orchestrator. Pushes are compare-and-set on a `rev`
// column (see supabase/migrations/002_user_data_rev.sql): a stale push updates
// zero rows, and the store is re-fetched, re-merged and retried instead of
// clobbering another device's write. Cloud payloads carry their schemaVersion;
// an older client never merges or overwrites a newer client's data. Cloud
// downloads REHYDRATE the zustand stores in place — no window.location.reload().

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
    const ts = getCloudTimestamps()
    const hashes = getLastSyncedHashes()
    const changedLocal: StoreName[] = []
    const uploads: Array<{ name: SyncRowName; state: Record<string, unknown>; expectedRev: number | null }> = []

    for (const name of names) {
      const local = getRowLocal(name)
      const cloudRow = cloudRows.get(name) ?? null
      const cloud = cloudRow?.payload ?? null

      const lastKnown = ts[name]
      const cloudIsNewer = !!cloudRow && (!lastKnown || cloudRow.updated_at > lastKnown)

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

      if (plan.upload) {
        const h = stateHash(plan.upload)
        // Skip unchanged stores (dirty check) — but always create a missing cloud row
        if (cloudRow && hashes[name] === h && cloudRow.payload && stateHash(cloudRow.payload.state) === h) continue
        uploads.push({ name, state: plan.upload, expectedRev: cloudRow ? cloudRow.rev : null })
      }

      if (cloudRow) ts[name] = cloudRow.updated_at
    }

    // Push with compare-and-set
    const conflicts: SyncRowName[] = []
    for (const up of uploads) {
      const data = wrapPayload(up.state, STORE_SCHEMA_VERSIONS[up.name])

      if (!casSupportedRef.current) {
        const { error } = await supabase.from('user_data').upsert(
          { user_id: user!.id, store_name: up.name, data },
          { onConflict: 'user_id,store_name' }
        )
        if (error) throw error
      } else if (up.expectedRev === null) {
        const { error } = await supabase.from('user_data').insert(
          { user_id: user!.id, store_name: up.name, data, rev: 1 }
        )
        if (error) {
          if (error.code === '23505') { conflicts.push(up.name); continue } // someone inserted first
          throw error
        }
      } else {
        const { data: updated, error } = await supabase.from('user_data')
          .update({ data, rev: up.expectedRev + 1 })
          .eq('user_id', user!.id)
          .eq('store_name', up.name)
          .eq('rev', up.expectedRev)
          .select('store_name')
        if (error) throw error
        if (!updated || updated.length === 0) { conflicts.push(up.name); continue } // stale rev
      }

      const hashesNow = getLastSyncedHashes()
      hashesNow[up.name] = stateHash(up.state)
      setLastSyncedHashes(hashesNow)
    }

    setCloudTimestamps(ts)
    if (changedLocal.length) await rehydrateStores(changedLocal)
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

    // Record fresh cloud timestamps after our own writes
    const finalRows = await fetchCloudRows()
    const ts = getCloudTimestamps()
    for (const [name, row] of finalRows) ts[name] = row.updated_at
    setCloudTimestamps(ts)
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
