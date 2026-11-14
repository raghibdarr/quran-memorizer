// Ramadan mode (all-in-one spec 2.2, 3.2): suhoor and iftar from the prayer
// engine's day, season detection, and the arithmetic of the fasting log. Pure,
// and free of adhan: callers pass in the times the engine computed, so the
// banner can decide whether it shows without loading the engine.
//
// The log lives in takrar-worship: fasts{[iso]: fasted | owed | exempt},
// madeUp.fasts (a count) and pauses. Days inside a pause, and exempt days, are
// left out of the counts. The make-up count carries on after Ramadan ends.
// Fidya and kaffara are not worked out here.

import { RAMADAN, fromHijri, hijriMonthLength, toHijri } from '@/lib/hijri/convert';
import { addDays, daysFrom } from '@/lib/hijri/calendar';
import type { FastEntry, FastMark, Pause } from '@/stores/worship-store';
import type { RamadanMode } from '@/types/prayer';

const MIN = 60_000;

// ---------- suhoor and iftar ----------

export interface FastTimes {
  /** When suhoor is shown to end: Fajr minus the precaution minutes */
  suhoorEnd: number | null;
  /** Fajr, when the fast begins */
  fajr: number | null;
  /** Maghrib, when the fast ends */
  iftar: number | null;
}

/** Suhoor end and iftar from one day's engine times (epoch ms; null where the engine has none) */
export function fastTimes(day: { fajr: number | null; maghrib: number | null }, imsakMin = 0): FastTimes {
  const pad = Math.max(0, Math.round(imsakMin)) * MIN;
  return {
    suhoorEnd: day.fajr === null ? null : day.fajr - pad,
    fajr: day.fajr,
    iftar: day.maghrib,
  };
}

export interface FastMoment {
  kind: 'suhoor' | 'iftar';
  at: number;
}

/** What the countdown counts to: today's suhoor end, else today's iftar, else tomorrow's suhoor end */
export function nextFastMoment(now: number, today: FastTimes, tomorrow: FastTimes): FastMoment | null {
  if (today.suhoorEnd !== null && now < today.suhoorEnd) return { kind: 'suhoor', at: today.suhoorEnd };
  if (today.iftar !== null && now < today.iftar) return { kind: 'iftar', at: today.iftar };
  if (tomorrow.suhoorEnd !== null && now < tomorrow.suhoorEnd) return { kind: 'suhoor', at: tomorrow.suhoorEnd };
  return null;
}

/**
 * Which day's suhoor and iftar to list under the countdown: today's until
 * today's iftar has passed, then tomorrow's (the ones the countdown now runs to).
 */
export function fastTimesToShow(now: number, today: FastTimes, tomorrow: FastTimes): { day: 'today' | 'tomorrow'; times: FastTimes } {
  return today.iftar !== null && now >= today.iftar ? { day: 'tomorrow', times: tomorrow } : { day: 'today', times: today };
}

// ---------- the season ----------

export interface RamadanSpan {
  hijriYear: number;
  /** First and last civil dates, expected */
  start: string;
  end: string;
  length: number;
}

export function ramadanSpan(hijriYear: number, offset = 0): RamadanSpan {
  const start = fromHijri(hijriYear, RAMADAN, 1, offset);
  const length = hijriMonthLength(hijriYear, RAMADAN);
  return { hijriYear, start, end: addDays(start, length - 1), length };
}

export interface RamadanSeason extends RamadanSpan {
  /** Today falls in Ramadan on the offset-adjusted calendar */
  inRamadan: boolean;
  /** Day of Ramadan (1-based) when inRamadan */
  day: number | null;
  /** Days until the expected start (0 once it has begun) */
  daysUntilStart: number;
  /** Ramadan mode is on: by hand, or 'auto' while the calendar says Ramadan */
  active: boolean;
  /** The /prayer banner shows: 'on', or 'auto' from 7 days before the start through the month */
  bannerVisible: boolean;
}

export const BANNER_LEAD_DAYS = 7;

/** This Ramadan, or the next one when this year's has passed */
export function ramadanSeason(today: string, offset = 0, mode: RamadanMode = 'auto'): RamadanSeason {
  const h = toHijri(today, offset);
  const inRamadan = h.month === RAMADAN;
  const span = ramadanSpan(h.month > RAMADAN ? h.year + 1 : h.year, offset);
  const daysUntilStart = Math.max(0, daysFrom(today, span.start));
  const active = mode === 'on' || (mode === 'auto' && inRamadan);
  const bannerVisible =
    mode === 'on' || (mode === 'auto' && (inRamadan || (daysUntilStart > 0 && daysUntilStart <= BANNER_LEAD_DAYS)));
  return { ...span, inRamadan, day: inRamadan ? h.day : null, daysUntilStart, active, bannerVisible };
}

/** The latest Ramadan that has begun by `today` (this one while it runs, else the one before) */
export function latestRamadan(today: string, offset = 0): RamadanSpan {
  const h = toHijri(today, offset);
  return ramadanSpan(h.month >= RAMADAN ? h.year : h.year - 1, offset);
}

/** The civil dates of a Ramadan, day 1 first */
export function ramadanDays(span: RamadanSpan): { iso: string; day: number }[] {
  return Array.from({ length: span.length }, (_, i) => ({ iso: addDays(span.start, i), day: i + 1 }));
}

/** The marks a day offers: all three in Ramadan (or with Ramadan mode on), else a voluntary fast only */
export function fastOptionsFor(iso: string, offset = 0, ramadanOn = false): FastMark[] {
  return ramadanOn || toHijri(iso, offset).month === RAMADAN ? ['fasted', 'owed', 'exempt'] : ['fasted'];
}

// ---------- pauses ----------

export function isPaused(iso: string, pauses: readonly Pause[]): boolean {
  return pauses.some((p) => p.from <= iso && (p.to === undefined || iso <= p.to));
}

/** The pause running on `today` (started on or before it, not yet ended before it) */
export function activePause(pauses: readonly Pause[], today: string): Pause | null {
  return pauses.find((p) => p.from <= today && (p.to === undefined || p.to >= today)) ?? null;
}

/**
 * Ending a pause on `today` counts today again: the pause runs to yesterday.
 * A pause started today is simply taken away.
 */
export function resumeOf(p: Pause, today: string): { kind: 'end'; to: string } | { kind: 'remove' } {
  const to = addDays(today, -1);
  return to < p.from ? { kind: 'remove' } : { kind: 'end', to };
}

// ---------- the log ----------

export interface FastCounts {
  fasted: number;
  owed: number;
  exempt: number;
}

/** Counts of each mark, leaving out paused days; `range` limits it to [from, to] */
export function countFasts(
  fasts: Readonly<Record<string, FastEntry>>,
  pauses: readonly Pause[],
  range?: { from: string; to: string },
): FastCounts {
  const out: FastCounts = { fasted: 0, owed: 0, exempt: 0 };
  for (const [iso, e] of Object.entries(fasts)) {
    if (range && (iso < range.from || iso > range.to)) continue;
    if (isPaused(iso, pauses)) continue;
    out[e.s]++;
  }
  return out;
}

export interface MakeUpDay {
  iso: string;
  /** Covered by a make-up fast (made-up fasts are applied oldest day first) */
  done: boolean;
}

export interface MakeUpList {
  days: MakeUpDay[];
  /** Fasts still to make up (never below zero) */
  left: number;
  /** Make-up fasts done */
  madeUp: number;
}

/**
 * Every day marked "not fasted", oldest first, outside pauses, with the
 * make-up fasts done applied in order. Carries across Ramadans: nothing resets.
 */
export function makeUpList(
  fasts: Readonly<Record<string, FastEntry>>,
  madeUp: number,
  pauses: readonly Pause[],
): MakeUpList {
  const owed = Object.entries(fasts)
    .filter(([iso, e]) => e.s === 'owed' && !isPaused(iso, pauses))
    .map(([iso]) => iso)
    .sort();
  const done = Math.max(0, Math.floor(madeUp));
  return {
    days: owed.map((iso, i) => ({ iso, done: i < done })),
    left: Math.max(0, owed.length - done),
    madeUp: done,
  };
}

// ---------- formatting (kept here so the banner needn't load the engine to print a time) ----------

/** "05:20" in the place's zone, 24-hour like the prayer screens */
export function formatClock(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  }
}

/** "in 2 h 4 min", "in 12 min", "now" (rounded up to the minute) */
export function formatCountdown(at: number, now: number): string {
  const mins = Math.ceil((at - now) / MIN);
  if (mins <= 0) return 'now';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `in ${m} min`;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}

// ---------- copy ----------

export const FAST_MARK_LABELS: Record<FastMark, string> = {
  fasted: 'Fasted',
  owed: 'Not fasted',
  exempt: 'Exempt',
};

export const FAST_MARK_HINTS: Record<FastMark, string> = {
  fasted: 'Counted as a fast kept',
  owed: 'Added to the fasts to make up',
  exempt: 'Left out of every count',
};

/** "Suhoor ends", "Iftar" */
export function momentLabel(kind: FastMoment['kind']): string {
  return kind === 'suhoor' ? 'Suhoor ends' : 'Iftar';
}

/** The banner's line before and during Ramadan, without times */
export function seasonLine(s: RamadanSeason): string {
  if (s.inRamadan && s.day !== null) return `Day ${s.day} of Ramadan`;
  if (s.daysUntilStart > BANNER_LEAD_DAYS) return 'Ramadan mode is on';
  if (s.daysUntilStart === 1) return 'Ramadan is expected tomorrow';
  return `Ramadan is expected in ${s.daysUntilStart} days`;
}
