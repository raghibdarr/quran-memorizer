import { STORE_NAMES, FLAG_KEYS, STORE_SCHEMA_VERSIONS, mergeStore, normalizeIncoming, type StoreName } from '@/lib/sync/merge'
import { getLocalData, setLocalData, getPersistedState, setPersistedState } from '@/lib/sync/local'
import { sanitizePrayerData, PRAYER_STORE_KEY, PRAYER_STORE_VERSION } from '@/stores/prayer-store'
import { sanitizeWorshipData, WORSHIP_STORE_KEY, WORSHIP_STORE_VERSION } from '@/stores/worship-store'
import { sanitizeZakatData, ZAKAT_STORE_KEY, ZAKAT_STORE_VERSION } from '@/stores/zakat-store'

// Full-progress backup for signed-out users (and belt-and-braces for everyone):
// one takrar-backup.json holding every persisted store plus the small localStorage
// flags. Import routes each store through the SAME per-store merge functions the
// cloud sync uses — never a blind overwrite, so importing an older backup cannot
// destroy newer local progress (unions/max/most-advanced win per store).
//
// The device-only stores (prayer settings, worship log, zakat) ride along in
// `device`. The place (takrar-place) never does: a backup file holds no coordinates.

export interface TakrarBackup {
  format: 'takrar-backup'
  version: 1
  exportedAt: string
  stores: Partial<Record<StoreName, Record<string, unknown>>>
  flags: Partial<Record<(typeof FLAG_KEYS)[number], string>>
  /** Per-store schema version at export (absent on the earliest backups) — lets a
   *  future build route old backups through migrations, and this build refuse a
   *  store exported by a NEWER build instead of misreading it. */
  versions?: Partial<Record<StoreName, number>>
  /** Device-only stores (never synced). Older builds ignore this field. */
  device?: Partial<Record<DeviceStoreName, Record<string, unknown>>>
  deviceVersions?: Partial<Record<DeviceStoreName, number>>
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
    const raw = backup.stores[storeName]
    if (!raw || typeof raw !== 'object') continue
    // A store written by a newer app version is left alone (same rule as sync)
    if ((backup.versions?.[storeName] ?? 0) > STORE_SCHEMA_VERSIONS[storeName]) continue
    const imported = normalizeIncoming(storeName, raw)
    const local = snapshot[storeName] ?? null
    out[storeName] = local
      ? mergeStore(storeName, local, imported, true)
      : imported
  }
  return out
}

// --- Device-only stores ---

/** The device-only stores a backup carries. takrar-place is deliberately absent. */
export const DEVICE_BACKUP_STORES = [PRAYER_STORE_KEY, WORSHIP_STORE_KEY, ZAKAT_STORE_KEY] as const
export type DeviceStoreName = (typeof DEVICE_BACKUP_STORES)[number]

export const DEVICE_STORE_VERSIONS: Record<DeviceStoreName, number> = {
  'takrar-prayer': PRAYER_STORE_VERSION,
  'takrar-worship': WORSHIP_STORE_VERSION,
  'takrar-zakat': ZAKAT_STORE_VERSION,
}

/** Each store's own sanitizer: only known fields leave the device and only known
 *  fields come back in, so nothing unexpected (coordinates included) rides along */
const SANITIZE: Record<DeviceStoreName, (raw: unknown) => object> = {
  'takrar-prayer': sanitizePrayerData,
  'takrar-worship': sanitizeWorshipData,
  'takrar-zakat': sanitizeZakatData,
}

/** The newer `at` wins per entry; a tie keeps the local copy */
function newerAt<T extends { at: number }>(local: Record<string, T>, imported: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...imported }
  for (const [k, v] of Object.entries(local)) {
    if (!out[k] || v.at >= out[k].at) out[k] = v
  }
  return out
}

/** The worship log merges like a synced store: nothing logged on this device is lost */
function mergeWorshipBackup(local: Record<string, unknown>, imported: Record<string, unknown>): Record<string, unknown> {
  const l = sanitizeWorshipData(local)
  const b = sanitizeWorshipData(imported)
  type Day = Record<string, { at: number }>
  const prayers: Record<string, Day> = { ...(b.prayers as Record<string, Day>) }
  for (const [iso, day] of Object.entries(l.prayers as Record<string, Day>)) {
    prayers[iso] = newerAt(day, prayers[iso] ?? {})
  }
  const pauses = [...b.pauses.filter((p) => !l.pauses.some((q) => q.id === p.id)), ...l.pauses]
  const tasbihTotals: Record<string, number> = { ...b.tasbihTotals }
  for (const [id, n] of Object.entries(l.tasbihTotals)) tasbihTotals[id] = Math.max(tasbihTotals[id] ?? 0, n)
  return {
    prayers,
    fasts: newerAt(l.fasts, b.fasts),
    madeUp: { prayers: Math.max(l.madeUp.prayers, b.madeUp.prayers), fasts: Math.max(l.madeUp.fasts, b.madeUp.fasts) },
    pauses,
    tasbihTotals,
  }
}

/**
 * Restore the device-only stores from a backup into a snapshot of local states.
 * Settings (prayer, zakat) take the backup's values: importing is a restore. The
 * worship log merges, so an older backup never erases days logged since.
 */
export function applyDeviceBackup(
  backup: TakrarBackup,
  snapshot: Partial<Record<DeviceStoreName, Record<string, unknown> | null>>,
): Partial<Record<DeviceStoreName, Record<string, unknown>>> {
  const out: Partial<Record<DeviceStoreName, Record<string, unknown>>> = {}
  for (const name of DEVICE_BACKUP_STORES) {
    const raw = backup.device?.[name]
    if (!raw || typeof raw !== 'object') continue
    if ((backup.deviceVersions?.[name] ?? 0) > DEVICE_STORE_VERSIONS[name]) continue
    const local = snapshot[name] ?? null
    out[name] = name === WORSHIP_STORE_KEY && local
      ? mergeWorshipBackup(local, raw)
      : (SANITIZE[name](raw) as Record<string, unknown>)
  }
  return out
}

/** The device-only part of a backup, given a reader of persisted store states */
export function collectDeviceStores(
  read: (key: string) => Record<string, unknown> | null,
): Required<Pick<TakrarBackup, 'device' | 'deviceVersions'>> {
  const device: NonNullable<TakrarBackup['device']> = {}
  const deviceVersions: NonNullable<TakrarBackup['deviceVersions']> = {}
  for (const name of DEVICE_BACKUP_STORES) {
    const data = read(name)
    if (!data) continue
    device[name] = SANITIZE[name](data) as Record<string, unknown>
    deviceVersions[name] = DEVICE_STORE_VERSIONS[name]
  }
  return { device, deviceVersions }
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
  const versions: TakrarBackup['versions'] = {}
  for (const storeName of STORE_NAMES) {
    const data = getLocalData(storeName)
    if (data) {
      stores[storeName] = data
      versions[storeName] = STORE_SCHEMA_VERSIONS[storeName]
    }
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
    versions,
    ...collectDeviceStores(getPersistedState),
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
 * Returns the number of stores restored; the caller rehydrates the live stores
 * (rehydrateStores and rehydrateDeviceStores).
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

  const deviceSnapshot: Partial<Record<DeviceStoreName, Record<string, unknown> | null>> = {}
  for (const name of DEVICE_BACKUP_STORES) deviceSnapshot[name] = getPersistedState(name)
  const device = applyDeviceBackup(backup, deviceSnapshot)
  for (const [name, data] of Object.entries(device) as Array<[DeviceStoreName, Record<string, unknown>]>) {
    setPersistedState(name, data, DEVICE_STORE_VERSIONS[name])
  }
  return Object.keys(merged).length + Object.keys(device).length
}
