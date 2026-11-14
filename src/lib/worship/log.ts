// The prayer log's pure logic (all-in-one spec 2.7 "Tracker", 3.2). The store
// (src/stores/worship-store.ts) holds the data; everything that reads it for a
// screen goes through here so it can be tested without React or a clock.
//
// Calm by design (spec 1.6): nothing here infers "missed" from an empty slot.
// A prayer is missed only when the user says so, and only those count towards
// make-up prayers. Days inside a pause are left out of every count.

import { addDaysIso } from '@/lib/dates';
import { PRAYER_NAMES, type PrayerName } from '@/types/prayer';
import type { Pause, PrayerEntry, PrayerMark, WorshipData } from '@/stores/worship-store';

export type PrayerLog = WorshipData['prayers'];
export type DayLog = PrayerLog[string];

/**
 * What a tap on a passed prayer records: on time when it is marked before the
 * prayer's time ends (the next time begins: sunrise for Fajr, the next day's
 * Fajr for Isha), late after. Null while the prayer's time has not begun (the
 * tick is inert then). A missing end (high latitude) counts as on time.
 */
export function inferMark(at: number, startMs: number, endMs: number | null): Exclude<PrayerMark, 'missed'> | null {
  if (!Number.isFinite(at) || at < startMs) return null;
  if (endMs === null || !Number.isFinite(endMs) || at < endMs) return 'ontime';
  return 'late';
}

/** The log with one prayer marked (same result as the store's markPrayer) */
export function setMark(log: PrayerLog, iso: string, prayer: PrayerName, s: PrayerMark, at: number): PrayerLog {
  return { ...log, [iso]: { ...log[iso], [prayer]: { s, at } } };
}

/** The log with one prayer cleared; an emptied day disappears (same as the store's clearPrayer) */
export function clearMark(log: PrayerLog, iso: string, prayer: PrayerName): PrayerLog {
  if (!log[iso]?.[prayer]) return log;
  const day = { ...log[iso] };
  delete day[prayer];
  const next = { ...log };
  if (Object.keys(day).length) next[iso] = day;
  else delete next[iso];
  return next;
}

// ---------- Pauses ----------
// A pause covers `from` to `to` inclusive; with no `to` it is still running and
// covers every day from `from` on.

export function isPaused(iso: string, pauses: readonly Pause[]): boolean {
  return pauses.some((p) => iso >= p.from && (p.to === undefined || iso <= p.to));
}

/** The pause still running, if any */
export function openPause(pauses: readonly Pause[]): Pause | undefined {
  return pauses.find((p) => p.to === undefined);
}

/**
 * Resuming today: the pause ends yesterday, so today counts again. A pause that
 * began today has covered nothing yet and is removed instead.
 */
export function resumeFor(pause: Pause, todayIso: string): { remove: true } | { remove: false; to: string } {
  const to = addDaysIso(todayIso, -1);
  return to < pause.from ? { remove: true } : { remove: false, to };
}

// ---------- Counts ----------

export interface Tally {
  ontime: number;
  late: number;
  missed: number;
  /** On time plus late */
  prayed: number;
}

const emptyTally = (): Tally => ({ ontime: 0, late: 0, missed: 0, prayed: 0 });

function addEntry(t: Tally, e: PrayerEntry | undefined) {
  if (!e) return;
  if (e.s === 'ontime') t.ontime++;
  else if (e.s === 'late') t.late++;
  else if (e.s === 'missed') t.missed++;
  t.prayed = t.ontime + t.late;
}

/** One day's marks */
export function dayTally(day: DayLog | undefined): Tally {
  const t = emptyTally();
  if (day) for (const p of PRAYER_NAMES) addEntry(t, day[p]);
  return t;
}

export interface RangeTally extends Tally {
  /** Days in the range that count (not paused) */
  days: number;
}

/** Marks across fromIso..toIso inclusive, leaving paused days out */
export function rangeTally(log: PrayerLog, pauses: readonly Pause[], fromIso: string, toIso: string): RangeTally {
  const t: RangeTally = { ...emptyTally(), days: 0 };
  for (let iso = fromIso; iso <= toIso; iso = addDaysIso(iso, 1)) {
    if (isPaused(iso, pauses)) continue;
    t.days++;
    const d = dayTally(log[iso]);
    t.ontime += d.ontime;
    t.late += d.late;
    t.missed += d.missed;
  }
  t.prayed = t.ontime + t.late;
  return t;
}

/** Prayers the user marked missed (outside pauses), newest first */
export function missedEntries(log: PrayerLog, pauses: readonly Pause[]): { iso: string; prayer: PrayerName }[] {
  const out: { iso: string; prayer: PrayerName }[] = [];
  for (const iso of Object.keys(log).sort().reverse()) {
    if (isPaused(iso, pauses)) continue;
    for (const p of [...PRAYER_NAMES].reverse()) if (log[iso][p]?.s === 'missed') out.push({ iso, prayer: p });
  }
  return out;
}

/**
 * Make-up (qada) prayers still to do: every prayer marked missed outside a pause
 * (plus any folded into the archive by compact()), less those made up. Never
 * below zero.
 */
export function makeUpOwed(
  log: PrayerLog,
  pauses: readonly Pause[],
  madeUp: number,
  archive: Readonly<Record<string, MonthFold>> = {},
): number {
  let missed = missedEntries(log, pauses).length;
  for (const m of Object.values(archive)) missed += m.missed;
  return Math.max(0, missed - Math.max(0, madeUp));
}

/**
 * How far the made-up count has run ahead of the prayers marked missed (paused
 * days included, so pausing never trims it). When a missed mark is cleared or
 * changed after it was made up, the caller takes this many back; otherwise the
 * spare make-up would quietly cancel the next prayer marked missed.
 */
export function madeUpSurplus(log: PrayerLog, madeUp: number, archive: Readonly<Record<string, MonthFold>> = {}): number {
  let missed = 0;
  for (const day of Object.values(log)) missed += dayTally(day).missed;
  for (const m of Object.values(archive)) missed += m.missed;
  return Math.max(0, Math.max(0, madeUp) - missed);
}

// ---------- Compaction ----------
// About 60 bytes a logged day is small, but the log grows forever. Once it runs
// past two years, whole months older than that fold into per-month counts.
// Specified and tested here; not wired to the store yet (a store change is a
// foundations edit, spec 3.8).

export interface MonthFold {
  ontime: number;
  late: number;
  missed: number;
}

export interface Compacted {
  prayers: PrayerLog;
  /** Keyed YYYY-MM */
  archive: Record<string, MonthFold>;
}

export const COMPACT_KEEP_DAYS = 730;

/**
 * Folds every whole month that ends more than `keepDays` before today into
 * `archive` (adding to what is there). Paused days are dropped as they fold,
 * since they never count. Returns the inputs unchanged when nothing is that old.
 * Idempotent; counts outside pauses are conserved.
 */
export function compact(
  log: PrayerLog,
  pauses: readonly Pause[],
  todayIso: string,
  archive: Readonly<Record<string, MonthFold>> = {},
  keepDays = COMPACT_KEEP_DAYS,
): Compacted {
  // Months before the cutoff month fold; the cutoff month itself is kept whole
  const cutoffMonth = addDaysIso(todayIso, -keepDays).slice(0, 7);
  const old = Object.keys(log).filter((iso) => iso.slice(0, 7) < cutoffMonth);
  if (old.length === 0) return { prayers: log, archive: { ...archive } };
  const prayers: PrayerLog = { ...log };
  const out: Record<string, MonthFold> = {};
  for (const [k, v] of Object.entries(archive)) out[k] = { ...v };
  for (const iso of old) {
    const day = prayers[iso];
    delete prayers[iso];
    if (isPaused(iso, pauses)) continue;
    const t = dayTally(day);
    const month = iso.slice(0, 7);
    const m = (out[month] ??= { ontime: 0, late: 0, missed: 0 });
    m.ontime += t.ontime;
    m.late += t.late;
    m.missed += t.missed;
  }
  return { prayers, archive: out };
}
