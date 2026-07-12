import { STORE_NAMES, FLAG_KEYS, mergeStore, type StoreName } from '@/lib/sync/merge'
import { getLocalData, setLocalData } from '@/lib/sync/local'

// Full-progress backup for signed-out users (and belt-and-braces for everyone):
// one takrar-backup.json holding every persisted store plus the small localStorage
// flags. Import routes each store through the SAME per-store merge functions the
// cloud sync uses — never a blind overwrite, so importing an older backup cannot
// destroy newer local progress (unions/max/most-advanced win per store).

export interface TakrarBackup {
  format: 'takrar-backup'
  version: 1
  exportedAt: string
  stores: Partial<Record<StoreName, Record<string, unknown>>>
  flags: Partial<Record<(typeof FLAG_KEYS)[number], string>>
}

// --- Pure core (unit-tested; no browser APIs) ---

/**
 * Merge a backup's stores into a snapshot of current local store states.
 * `local === null` means the store doesn't exist locally (fresh profile) — the
 * backup restores it wholesale. Otherwise the sync merge applies; the backup
 * plays the "cloud" role with cloudIsNewer=true because importing is an explicit
 * restore action (this only affects the side-picking stores, settings/plan base —
 * union- and recency-based stores still keep newer local data regardless).
 */
export function applyBackupToSnapshot(
  backup: TakrarBackup,
  snapshot: Partial<Record<StoreName, Record<string, unknown> | null>>,
): Partial<Record<StoreName, Record<string, unknown>>> {
  const out: Partial<Record<StoreName, Record<string, unknown>>> = {}
  for (const storeName of STORE_NAMES) {
    const imported = backup.stores[storeName]
    if (!imported || typeof imported !== 'object') continue
    const local = snapshot[storeName] ?? null
    out[storeName] = local
      ? mergeStore(storeName, local, imported, true)
      : imported
  }
  return out
}

/** Validate an arbitrary parsed JSON value as a Takrar backup. Throws with a friendly message. */
export function validateBackup(parsed: unknown): TakrarBackup {
  const b = parsed as Partial<TakrarBackup> | null
  if (!b || typeof b !== 'object' || b.format !== 'takrar-backup') {
    throw new Error("This file isn't a Takrar backup.")
  }
  if (b.version !== 1) {
    throw new Error(`Unsupported backup version (${String(b.version)}). Update the app and try again.`)
  }
  if (!b.stores || typeof b.stores !== 'object') {
    throw new Error('Backup file is damaged (no store data found).')
  }
  return b as TakrarBackup
}

// --- Browser wrappers ---

export function buildBackup(): TakrarBackup {
  const stores: TakrarBackup['stores'] = {}
  for (const storeName of STORE_NAMES) {
    const data = getLocalData(storeName)
    if (data) stores[storeName] = data
  }
  const flags: TakrarBackup['flags'] = {}
  for (const key of FLAG_KEYS) {
    const value = localStorage.getItem(key)
    if (value !== null) flags[key] = value
  }
  return {
    format: 'takrar-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    stores,
    flags,
  }
}

export function downloadBackup() {
  const backup = buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `takrar-backup-${backup.exportedAt.slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Import a backup: merge every store into localStorage and restore flags.
 * Returns the number of stores restored; caller should reload so Zustand rehydrates.
 */
export function importBackup(parsed: unknown): number {
  const backup = validateBackup(parsed)
  const snapshot: Partial<Record<StoreName, Record<string, unknown> | null>> = {}
  for (const storeName of STORE_NAMES) snapshot[storeName] = getLocalData(storeName)

  const merged = applyBackupToSnapshot(backup, snapshot)
  for (const [storeName, data] of Object.entries(merged)) {
    setLocalData(storeName as StoreName, data)
  }
  for (const [key, value] of Object.entries(backup.flags ?? {})) {
    if (typeof value === 'string') localStorage.setItem(key, value)
  }
  return Object.keys(merged).length
}
