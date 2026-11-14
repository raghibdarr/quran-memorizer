// The Hijri month grid behind /calendar (all-in-one spec 2.2), and the "today"
// every Hijri screen starts from. Pure, on top of convert.ts: dates in and out
// are CIVIL dates ('YYYY-MM-DD'), so the device time zone never shifts a day.
// Every date here is calculated, not sighted: screens call them "expected", and
// the user's hijriOffset (-2..2) moves all of them together.

import { HIJRI_MONTHS, fromHijri, hijriMonthLength, toHijri, type HijriDate } from './convert';

const MS_DAY = 86_400_000;

export interface HijriMonthRef {
  year: number;
  /** 1 = Muharram … 12 = Dhu al-Hijjah */
  month: number;
}

export interface GridDay {
  /** Civil date, 'YYYY-MM-DD' */
  iso: string;
  hijri: HijriDate;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  isToday: boolean;
}

export interface MonthGrid extends HijriMonthRef {
  /** 29 or 30 */
  length: number;
  days: GridDay[];
  /** Rows of seven; null fills the cells before day 1 and after the last day */
  weeks: (GridDay | null)[][];
  /** "November – December 2026" */
  gregorianSpan: string;
}

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const GREGORIAN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Days since 1970-01-01 of a civil date */
export function dayNumberOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
}

export function isoOfDayNumber(n: number): string {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return isoOfDayNumber(dayNumberOf(iso) + n);
}

/** Whole days from a to b (b later = positive) */
export function daysFrom(a: string, b: string): number {
  return dayNumberOf(b) - dayNumberOf(a);
}

/** 0 = Sunday … 6 = Saturday, for a civil date */
export function weekdayOf(iso: string): number {
  return new Date(dayNumberOf(iso) * MS_DAY).getUTCDay();
}

/**
 * Today's civil date: in the place's IANA zone when one is given (prayer times
 * and the Hijri day follow the place), else on the device's own calendar.
 * An unknown zone falls back to the device.
 */
export function todayIso(now: number = Date.now(), tz?: string): string {
  if (tz) {
    try {
      // Read the parts, not a locale's formatted string: some engines print en-CA dates with slashes
      const parts = new Intl.DateTimeFormat('en-u-ca-gregory-nu-latn', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      const iso = `${get('year').padStart(4, '0')}-${get('month').padStart(2, '0')}-${get('day').padStart(2, '0')}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    } catch {
      // fall through to the device's calendar
    }
  }
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The Hijri month a civil date falls in, under the offset */
export function hijriMonthOf(iso: string, offset = 0): HijriMonthRef {
  const h = toHijri(iso, offset);
  return { year: h.year, month: h.month };
}

/** Move by whole Hijri months (negative goes back) */
export function addHijriMonths(ref: HijriMonthRef, n: number): HijriMonthRef {
  const index = ref.year * 12 + (ref.month - 1) + n;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

export function sameMonth(a: HijriMonthRef, b: HijriMonthRef): boolean {
  return a.year === b.year && a.month === b.month;
}

/** "Ramadan 1448" */
export function formatHijriMonth(ref: HijriMonthRef): string {
  return `${HIJRI_MONTHS[ref.month - 1]} ${ref.year}`;
}

/** First and last civil dates of a Hijri month under the offset */
export function monthBounds(ref: HijriMonthRef, offset = 0): { first: string; last: string; length: number } {
  const first = fromHijri(ref.year, ref.month, 1, offset);
  const length = hijriMonthLength(ref.year, ref.month);
  return { first, last: addDays(first, length - 1), length };
}

/** "November – December 2026", "December 2026 – January 2027", "March 2027" */
export function gregorianSpan(firstIso: string, lastIso: string): string {
  const [y1, m1] = firstIso.split('-').map(Number);
  const [y2, m2] = lastIso.split('-').map(Number);
  const a = GREGORIAN_MONTHS[m1 - 1];
  const b = GREGORIAN_MONTHS[m2 - 1];
  if (y1 === y2 && m1 === m2) return `${a} ${y1}`;
  if (y1 === y2) return `${a} – ${b} ${y1}`;
  return `${a} ${y1} – ${b} ${y2}`;
}

/** "Monday 8 February 2027" (or without the weekday) */
export function formatCivil(iso: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = opts.weekday === false ? '' : `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekdayOf(iso)]} `;
  return `${wd}${d} ${GREGORIAN_MONTHS[m - 1]}${opts.year === false ? '' : ` ${y}`}`;
}

/** "8 Feb" */
export function formatCivilShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${GREGORIAN_MONTHS[m - 1].slice(0, 3)}`;
}

/**
 * The grid for one Hijri month: every day with its civil date, laid out in
 * weeks that start on `weekStart` (0 = Sunday, 1 = Monday, 6 = Saturday).
 */
export function monthGrid(ref: HijriMonthRef, opts: { offset?: number; today?: string; weekStart?: number } = {}): MonthGrid {
  const offset = opts.offset ?? 0;
  const weekStart = opts.weekStart ?? 0;
  const { first, last, length } = monthBounds(ref, offset);
  const days: GridDay[] = [];
  for (let i = 0; i < length; i++) {
    const iso = addDays(first, i);
    days.push({
      iso,
      hijri: { year: ref.year, month: ref.month, day: i + 1 },
      weekday: weekdayOf(iso),
      isToday: iso === opts.today,
    });
  }
  const lead = (days[0].weekday - weekStart + 7) % 7;
  const cells: (GridDay | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (GridDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { ...ref, length, days, weeks, gregorianSpan: gregorianSpan(first, last) };
}

/** The weekday labels in grid order */
export function weekdayHeaders(weekStart = 0): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS_SHORT[(weekStart + i) % 7]);
}
