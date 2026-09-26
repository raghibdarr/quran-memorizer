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

/** JSON with object keys sorted at every level. Postgres JSONB reorders keys, so a
 *  plain JSON.stringify of a round-tripped row never matched the local state. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function stateHash(state: Record<string, unknown> | null): number {
  return state ? hashString(canonicalJson(state)) : 0
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

// ---------- Seen markers ----------
// For each row: the exact cloud version this device's local state already
// incorporates. Set ONLY when we merged that version in or wrote it ourselves —
// never by blanket-refreshing from a later fetch (which marked other devices'
// writes as seen without merging them, so our next push overwrote them).
// "Cloud is newer" = the cloud row differs from the marker. Persisted (not
// session-scoped) so a cold start doesn't treat every row as foreign, and keyed
// to the signed-in user.

export interface SeenMarker {
  rev: number
  updatedAt: string
}

const SEEN_KEY = 'sync-seen'

export function getSeenMarkers(userId: string): Record<string, SeenMarker> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && parsed.userId === userId ? parsed.rows ?? {} : {}
  } catch {
    return {}
  }
}

export function setSeenMarker(userId: string, name: string, marker: SeenMarker) {
  try {
    const rows = getSeenMarkers(userId)
    rows[name] = marker
    localStorage.setItem(SEEN_KEY, JSON.stringify({ userId, rows }))
  } catch { /* ignore */ }
}

export function clearSeenMarkers() {
  try {
    localStorage.removeItem(SEEN_KEY)
    sessionStorage.removeItem('sync-timestamps') // pre-marker session cache
  } catch { /* ignore */ }
}
