// THE one source of truth for "what day is it" — all app-day logic must use these.
// Everything is LOCAL time: a user's day boundary is their midnight, not UTC's
// (the old stats-store used toISOString(), which flipped days at UTC midnight and
// disagreed with the plan's local dates — audit systemic issue #2).
//
// Two kinds of values live here, and they must not be mixed up:
//  - "app days": YYYY-MM-DD strings naming a LOCAL calendar day
//  - timestamps: ms since epoch (absolute instants)
// Converting between them always goes through the local clock. Arithmetic ON
// day strings (daysBetween, addDaysIso) is done in UTC space deliberately —
// the strings are opaque calendar labels there, so DST can't skew the math.

export function todayIso(): string {
  return isoFromMs(Date.now())
}

export function yesterdayIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return isoFromDate(d)
}

/** The LOCAL calendar day an instant falls on. */
export function isoFromMs(ts: number): string {
  return isoFromDate(new Date(ts))
}

function isoFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Local start-of-day for an arbitrary timestamp */
export function startOfDayMs(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// ---------- Calendar arithmetic on YYYY-MM-DD day strings ----------
// Parsed as UTC midnights so day-diff math is exact integers even when the
// span crosses a DST transition (local parsing would yield 23h/25h "days").

const MS_PER_DAY = 86_400_000

/** Parse a YYYY-MM-DD string as a UTC Date at midnight, for safe arithmetic. */
export function isoToDateUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function dateUTCToIso(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Number of calendar days from `fromIso` to `toIso` (toIso - fromIso). Negative if toIso is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToDateUTC(toIso).getTime() - isoToDateUTC(fromIso).getTime()) / MS_PER_DAY)
}

/** Add N calendar days to an ISO date. */
export function addDaysIso(iso: string, days: number): string {
  const d = isoToDateUTC(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return dateUTCToIso(d)
}

/** Day-of-week (0=Sun) membership check against a plan's study days. */
export function isStudyDay(dateIso: string, studyDays: number[]): boolean {
  const dow = isoToDateUTC(dateIso).getUTCDay()
  return studyDays.includes(dow)
}

/** How many study days exist in [fromIso, toIso] inclusive. */
export function countStudyDays(fromIso: string, toIso: string, studyDays: number[]): number {
  const total = daysBetween(fromIso, toIso) + 1
  if (total <= 0) return 0
  const set = new Set(studyDays)
  let count = 0
  const cursor = isoToDateUTC(fromIso)
  for (let i = 0; i < total; i++) {
    if (set.has(cursor.getUTCDay())) count++
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return count
}
