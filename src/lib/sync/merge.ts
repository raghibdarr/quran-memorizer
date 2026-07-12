// The PURE sync merge engine — no browser APIs, no Supabase, fully unit-testable.
// Extracted from use-sync.ts (M2): these functions decide how two copies of a
// store's state combine. Every merge must be safe to run repeatedly and in any
// order — property tests in merge.test.ts pin idempotence/commutativity/no-loss.

export const STORE_NAMES = [
  'quran-progress',
  'quran-reviews',
  'quran-stats',
  'quran-settings',
  'quran-practice',
  'quran-plan',
  'quran-essentials',
] as const

export type StoreName = typeof STORE_NAMES[number]

/** Synthetic sync row for the small localStorage flags (onboarding etc.) —
 *  synced so a second device doesn't re-onboard. */
export const FLAGS_STORE = 'quran-flags' as const
export type SyncRowName = StoreName | typeof FLAGS_STORE

export const FLAG_KEYS = [
  'quran-dark-mode',
  'onboarding-complete',
  'chunk-explainer-seen',
  'tajweed-legend-seen',
  'lesson-review-migration-v4',
  'home-sort',
  'home-view',
  'home-tab',
] as const

/**
 * The schema version THIS client writes per store. Must match each store's
 * zustand `persist` version (pinned by fixtures.test.ts). A cloud payload with
 * a NEWER version than this client understands is never merged or overwritten
 * (see planStoreMerge) — an old app can't corrupt a new app's data.
 */
export const STORE_SCHEMA_VERSIONS: Record<SyncRowName, number> = {
  'quran-progress': 2,
  'quran-reviews': 2, // v2 (M3): stored nextReview truncated to local start-of-day
  'quran-stats': 3, // v3 (M3): streakFreezes/frozenDates added, future dates clamped
  'quran-settings': 2,
  'quran-practice': 1,
  'quran-plan': 1,
  'quran-essentials': 1,
  'quran-flags': 1,
}

// ---------- Cloud payload envelope ----------
// New rows are { __v, state }; legacy rows are the bare state (treated as v0).

export interface CloudPayload {
  state: Record<string, unknown>
  schemaVersion: number
}

export function wrapPayload(state: Record<string, unknown>, schemaVersion: number): Record<string, unknown> {
  return { __v: schemaVersion, state }
}

export function readPayload(data: Record<string, unknown> | null | undefined): CloudPayload | null {
  if (!data || typeof data !== 'object') return null
  if (typeof data.__v === 'number' && data.state && typeof data.state === 'object') {
    return { state: data.state as Record<string, unknown>, schemaVersion: data.__v }
  }
  return { state: data, schemaVersion: 0 } // legacy bare-state row
}

// ---------- Per-store merges (moved verbatim from use-sync.ts) ----------

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
 * Merge review cards: per ayah (surahId:ayahNumber) and per lessonId, keep the
 * copy with more repetitions, tie-broken by later lastReview.
 */
function mergeReviews(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  const pickStronger = (
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): Record<string, unknown> => {
    const aReps = (a.repetitions as number) ?? 0
    const bReps = (b.repetitions as number) ?? 0
    if (aReps !== bReps) return aReps > bReps ? a : b
    return ((a.lastReview as number) ?? 0) >= ((b.lastReview as number) ?? 0) ? a : b
  }

  const cardMap = new Map<string, Record<string, unknown>>()
  for (const card of (cloud.cards ?? []) as Array<Record<string, unknown>>) {
    cardMap.set(`${card.surahId}:${card.ayahNumber}`, card)
  }
  for (const card of (local.cards ?? []) as Array<Record<string, unknown>>) {
    const key = `${card.surahId}:${card.ayahNumber}`
    const existing = cardMap.get(key)
    cardMap.set(key, existing ? pickStronger(card, existing) : card)
  }

  const lessonCardMap = new Map<string, Record<string, unknown>>()
  for (const card of (cloud.lessonCards ?? []) as Array<Record<string, unknown>>) {
    lessonCardMap.set(card.lessonId as string, card)
  }
  for (const card of (local.lessonCards ?? []) as Array<Record<string, unknown>>) {
    const id = card.lessonId as string
    const existing = lessonCardMap.get(id)
    lessonCardMap.set(id, existing ? pickStronger(card, existing) : card)
  }

  return {
    ...local,
    cards: Array.from(cardMap.values()),
    lessonCards: Array.from(lessonCardMap.values()),
  }
}

/**
 * Merge stats: keep higher totals/logs, streak from the most recently active side.
 */
function mergeStats(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  const localDate = (local.dailyActivityDate as string) ?? ''
  const cloudDate = (cloud.dailyActivityDate as string) ?? ''
  const dailyActivityDate = localDate >= cloudDate ? localDate : cloudDate
  const dailyActivities = localDate >= cloudDate
    ? (local.dailyActivities as number) ?? 0
    : (cloud.dailyActivities as number) ?? 0

  const localLog = (local.activityLog as Record<string, number>) ?? {}
  const cloudLog = (cloud.activityLog as Record<string, number>) ?? {}
  const mergedLog: Record<string, number> = { ...localLog }
  for (const [date, count] of Object.entries(cloudLog)) {
    mergedLog[date] = Math.max(mergedLog[date] ?? 0, count)
  }

  // Current streak comes from whichever side was active most recently
  // (Math.max would prevent streak from ever resetting after a missed day)
  const localLastActive = (local.lastActiveDate as string) ?? ''
  const cloudLastActive = (cloud.lastActiveDate as string) ?? ''
  const mostRecentSide = localLastActive >= cloudLastActive ? local : cloud
  const currentStreak = (mostRecentSide.currentStreak as number) ?? 0

  return {
    currentStreak,
    // Freeze bank rides with the streak it protects (max would resurrect a
    // spent freeze); frozen days are monotone facts, so union is safe
    streakFreezes: (mostRecentSide.streakFreezes as number) ?? 0,
    frozenDates: {
      ...((cloud.frozenDates ?? {}) as Record<string, true>),
      ...((local.frozenDates ?? {}) as Record<string, true>),
    },
    longestStreak: Math.max((local.longestStreak as number) ?? 0, (cloud.longestStreak as number) ?? 0),
    totalAyahsMemorized: Math.max((local.totalAyahsMemorized as number) ?? 0, (cloud.totalAyahsMemorized as number) ?? 0),
    lastActiveDate: (localLastActive >= cloudLastActive ? localLastActive : cloudLastActive) || null,
    dailyActivities,
    dailyActivityDate: dailyActivityDate || null,
    activityLog: mergedLog,
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

/** Merge practice sessions: union by session id, newest first. */
function mergePractice(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  const seen = new Set<string>()
  const merged: Array<Record<string, unknown>> = []
  for (const session of [
    ...((cloud.sessions ?? []) as Array<Record<string, unknown>>),
    ...((local.sessions ?? []) as Array<Record<string, unknown>>),
  ]) {
    const id = session.id as string
    if (!seen.has(id)) {
      seen.add(id)
      merged.push(session)
    }
  }
  merged.sort((a, b) => ((b.timestamp as number) ?? 0) - ((a.timestamp as number) ?? 0))
  return { ...local, sessions: merged }
}

/** Settings: whole-store side-pick — the more recently synced device wins. */
function mergeSettings(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
  cloudIsNewer: boolean
): Record<string, unknown> {
  return cloudIsNewer ? cloud : local
}

/**
 * Merge plans. Same plan id: union completedLessonIds, later lastRevisedAt per
 * surah, remaining fields from the newer side. Different ids: newer side wins.
 */
function mergePlan(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
  cloudIsNewer: boolean
): Record<string, unknown> {
  const localPlan = local.plan as Record<string, unknown> | null
  const cloudPlan = cloud.plan as Record<string, unknown> | null

  if (!localPlan && !cloudPlan) return { plan: null }
  if (!localPlan) return { plan: cloudPlan }
  if (!cloudPlan) return { plan: localPlan }

  if (localPlan.id !== cloudPlan.id) {
    return { plan: cloudIsNewer ? cloudPlan : localPlan }
  }

  const completedLessonIds = Array.from(new Set([
    ...(((localPlan.completedLessonIds ?? []) as string[])),
    ...(((cloudPlan.completedLessonIds ?? []) as string[])),
  ]))

  const lastRevisedAt: Record<string, number> = { ...((localPlan.lastRevisedAt ?? {}) as Record<string, number>) }
  for (const [k, v] of Object.entries((cloudPlan.lastRevisedAt ?? {}) as Record<string, number>)) {
    lastRevisedAt[k] = Math.max(lastRevisedAt[k] ?? 0, v)
  }

  const base = cloudIsNewer ? cloudPlan : localPlan
  return { plan: { ...base, completedLessonIds, lastRevisedAt } }
}

/** Essentials: union for memorized/favorites ("true" wins), max for counters. */
function mergeEssentials(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  const unionTrue = (a: unknown, b: unknown): Record<string, boolean> => {
    const out: Record<string, boolean> = { ...((b ?? {}) as Record<string, boolean>), ...((a ?? {}) as Record<string, boolean>) }
    for (const [k, v] of Object.entries((b ?? {}) as Record<string, boolean>)) {
      if (v) out[k] = true
    }
    return out
  }

  const localCounters = (local.counters ?? {}) as Record<string, number>
  const cloudCounters = (cloud.counters ?? {}) as Record<string, number>
  const counters: Record<string, number> = { ...cloudCounters }
  for (const [k, v] of Object.entries(localCounters)) {
    counters[k] = Math.max(counters[k] ?? 0, v)
  }

  return {
    memorized: unionTrue(local.memorized, cloud.memorized),
    favorites: unionTrue(local.favorites, cloud.favorites),
    counters,
  }
}

/** Flags: union of string keys; a set flag is never unset by an absent one; local wins on conflict. */
function mergeFlags(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  return { ...cloud, ...local }
}

/** Dispatch to the right merge function per store (also used by backup import). */
export function mergeStore(
  storeName: SyncRowName,
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
    case 'quran-plan': return mergePlan(local, cloud, cloudIsNewer)
    case 'quran-essentials': return mergeEssentials(local, cloud)
    case 'quran-flags': return mergeFlags(local, cloud)
  }
}

// ---------- Per-store sync planning (pure) ----------

export interface StoreMergePlan {
  /** New local state to write, or null if local is unchanged */
  newLocal: Record<string, unknown> | null
  /** State to upload, or null to skip uploading this store */
  upload: Record<string, unknown> | null
  /** Cloud was written by a NEWER app version — leave both sides untouched */
  blockedByNewerSchema: boolean
}

/**
 * Decide what happens to one store during a sync pass. Never merges or uploads
 * when the cloud payload's schema version is newer than this client's — an
 * outdated client must not clobber (or misread) data it doesn't understand.
 */
export function planStoreMerge(opts: {
  storeName: SyncRowName
  local: Record<string, unknown> | null
  cloud: CloudPayload | null
  cloudIsNewer: boolean
}): StoreMergePlan {
  const { storeName, local, cloud, cloudIsNewer } = opts
  const clientVersion = STORE_SCHEMA_VERSIONS[storeName]

  if (cloud && cloud.schemaVersion > clientVersion) {
    return { newLocal: null, upload: null, blockedByNewerSchema: true }
  }
  if (!local && !cloud) return { newLocal: null, upload: null, blockedByNewerSchema: false }
  if (!local && cloud) return { newLocal: cloud.state, upload: null, blockedByNewerSchema: false }
  if (local && !cloud) return { newLocal: null, upload: local, blockedByNewerSchema: false }

  if (cloudIsNewer) {
    const merged = mergeStore(storeName, local!, cloud!.state, true)
    return { newLocal: merged, upload: merged, blockedByNewerSchema: false }
  }
  return { newLocal: null, upload: local, blockedByNewerSchema: false }
}
