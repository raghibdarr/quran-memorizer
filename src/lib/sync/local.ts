// Browser-side localStorage IO for the sync engine (the pure logic lives in merge.ts).

import { FLAG_KEYS, STORE_SCHEMA_VERSIONS, type StoreName, type SyncRowName, FLAGS_STORE } from './merge'

/** Read a zustand-persisted store's STATE (unwrapping the {state, version} envelope). */
export function getLocalData(storeName: StoreName): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(storeName)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return (parsed.state ?? parsed) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Write a store's state, preserving/refreshing the zustand persist envelope. */
export function setLocalData(storeName: StoreName, data: unknown) {
  try {
    const existing = localStorage.getItem(storeName)
    if (existing) {
      const parsed = JSON.parse(existing)
      parsed.state = data
      localStorage.setItem(storeName, JSON.stringify(parsed))
    } else {
      localStorage.setItem(
        storeName,
        JSON.stringify({ state: data, version: STORE_SCHEMA_VERSIONS[storeName] })
      )
    }
  } catch {
    // ignore
  }
}

/** The synced flags pseudo-store, gathered from individual localStorage keys. */
export function getLocalFlags(): Record<string, unknown> {
  const flags: Record<string, string> = {}
  for (const key of FLAG_KEYS) {
    const value = localStorage.getItem(key)
    if (value !== null) flags[key] = value
  }
  return flags
}

export function setLocalFlags(flags: Record<string, unknown>) {
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value === 'string' && (FLAG_KEYS as readonly string[]).includes(key)) {
      localStorage.setItem(key, value)
    }
  }
}

export function getRowLocal(name: SyncRowName): Record<string, unknown> | null {
  if (name === FLAGS_STORE) {
    const flags = getLocalFlags()
    return Object.keys(flags).length ? flags : null
  }
  return getLocalData(name)
}

export function setRowLocal(name: SyncRowName, data: Record<string, unknown>) {
  if (name === FLAGS_STORE) setLocalFlags(data)
  else setLocalData(name, data)
}

// ---------- Dirty tracking ----------
// A store only uploads when its serialized state differs from what was last
// synced — cheap change detection without wiring every store mutation.

function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h
}

export function stateHash(state: Record<string, unknown> | null): number {
  return state ? hashString(JSON.stringify(state)) : 0
}

const HASHES_KEY = 'sync-last-hashes'

export function getLastSyncedHashes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(HASHES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setLastSyncedHashes(hashes: Record<string, number>) {
  try {
    localStorage.setItem(HASHES_KEY, JSON.stringify(hashes))
  } catch { /* ignore */ }
}

const LAST_SYNCED_KEY = 'sync-last-synced-at'

export function setLastSyncedAt(ts: number) {
  try { localStorage.setItem(LAST_SYNCED_KEY, String(ts)) } catch { /* ignore */ }
}

export function getLastSyncedAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SYNCED_KEY)
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}

// ---------- Cloud row timestamps (survive reloads within a session) ----------

export function getCloudTimestamps(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem('sync-timestamps')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function setCloudTimestamps(ts: Record<string, string>) {
  try {
    sessionStorage.setItem('sync-timestamps', JSON.stringify(ts))
  } catch { /* ignore */ }
}
