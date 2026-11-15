// Hijri dates (all-in-one spec 3.3). The platform's Umm al-Qura calendar
// (Intl `islamic-umalqura`) when it works, feature-tested at runtime against a
// known date; otherwise our own tabular (arithmetic) calendar. Either way the
// dates are calculated, not sighted: screens label them "expected", and the
// user's hijriOffset (-2..2 days) lines them up with their local announcement.
//
// Gregorian dates in and out are CIVIL dates ('YYYY-MM-DD' or a Date read by its
// local calendar fields), never instants, so time zones can't shift a day.

export interface HijriDate {
  year: number;
  /** 1 = Muharram … 9 = Ramadan … 12 = Dhu al-Hijjah */
  month: number;
  day: number;
}

export const HIJRI_MONTHS = [
  'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani", 'Jumada al-Ula', 'Jumada al-Akhirah',
  'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qa'dah", 'Dhu al-Hijjah',
] as const;

export const RAMADAN = 9;

const MS_DAY = 86_400_000;
/** Julian day of 1 Muharram 1 AH (16 July 622, Julian), the civil epoch */
const ISLAMIC_EPOCH = 1948439.5;
const UNIX_EPOCH_JD = 2440587.5;

// ---------- civil-date plumbing ----------

type CivilInput = Date | string;

/** Days since 1970-01-01 for a civil date (years 0-99 are read as written, not as 19xx) */
function dayNumber(input: CivilInput): number {
  const utc = (y: number, m: number, d: number) => {
    const t = new Date(Date.UTC(2000, m, d));
    t.setUTCFullYear(y);
    return t.getTime();
  };
  if (typeof input === 'string') {
    const [y, m, d] = input.split('-').map(Number);
    return Math.round(utc(y, m - 1, d) / MS_DAY);
  }
  return Math.round(utc(input.getFullYear(), input.getMonth(), input.getDate()) / MS_DAY);
}

function isoOfDayNumber(n: number): string {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

// ---------- tabular calendar (own arithmetic; leap years 2,5,7,10,13,16,18,21,24,26,29 of 30) ----------

function tabularToJd(year: number, month: number, day: number): number {
  return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354 + Math.floor((3 + 11 * year) / 30) + ISLAMIC_EPOCH - 1;
}

export function tabularToHijri(input: CivilInput): HijriDate {
  const jd = Math.floor(dayNumber(input) + UNIX_EPOCH_JD) + 0.5;
  const year = Math.floor((30 * (jd - ISLAMIC_EPOCH) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((jd - (29 + tabularToJd(year, 1, 1))) / 29.5) + 1);
  const day = jd - tabularToJd(year, month, 1) + 1;
  return { year, month, day };
}

export function tabularFromHijri(year: number, month: number, day: number): string {
  return isoOfDayNumber(Math.round(tabularToJd(year, month, day) - UNIX_EPOCH_JD));
}

// ---------- Umm al-Qura through Intl ----------

let intlFormat: Intl.DateTimeFormat | null | undefined;

function readIntl(fmt: Intl.DateTimeFormat, n: number): HijriDate | null {
  const parts = fmt.formatToParts(new Date(n * MS_DAY + MS_DAY / 2));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const h = { year: get('year'), month: get('month'), day: get('day') };
  return Number.isInteger(h.year) && Number.isInteger(h.month) && Number.isInteger(h.day) ? h : null;
}

/** The Intl formatter, or null when the platform lacks a working islamic-umalqura calendar */
function umalqura(): Intl.DateTimeFormat | null {
  if (intlFormat !== undefined) return intlFormat;
  intlFormat = null;
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
    if (fmt.resolvedOptions().calendar !== 'islamic-umalqura') return null;
    // Known dates: 1 Ramadan 1444 was 23 March 2023; 1 Muharram 1446 was 7 July 2024
    const a = readIntl(fmt, dayNumber('2023-03-23'));
    const b = readIntl(fmt, dayNumber('2024-07-07'));
    if (a?.year === 1444 && a.month === 9 && a.day === 1 && b?.year === 1446 && b.month === 1 && b.day === 1) intlFormat = fmt;
  } catch {
    intlFormat = null;
  }
  return intlFormat;
}

/** Which calendar is in use on this device */
export function hijriEngine(): 'umalqura' | 'tabular' {
  return umalqura() ? 'umalqura' : 'tabular';
}

/** Tests only: force the tabular fallback (true), or re-run the feature test (false) */
export function forceTabularForTests(on: boolean) {
  intlFormat = on ? null : undefined;
}

function hijriOfDay(n: number): HijriDate {
  const fmt = umalqura();
  return (fmt && readIntl(fmt, n)) || tabularToHijri(isoOfDayNumber(n));
}

const same = (a: HijriDate, b: HijriDate) => a.year === b.year && a.month === b.month && a.day === b.day;

// ---------- public API ----------

/** The Hijri date of a civil date, shifted by the user's offset in days */
export function toHijri(date: CivilInput, offset = 0): HijriDate {
  return hijriOfDay(dayNumber(date) + offset);
}

/** The civil date ('YYYY-MM-DD') of a Hijri date under the user's offset. Throws on a day the month lacks */
export function fromHijri(year: number, month: number, day: number, offset = 0): string {
  const target = { year, month, day };
  const guess = dayNumber(tabularFromHijri(year, month, day));
  // Umm al-Qura and the tabular calendar stay within a couple of days of each other
  for (let delta = 0; delta <= 5; delta++) {
    for (const n of delta ? [guess + delta, guess - delta] : [guess]) {
      if (same(hijriOfDay(n), target)) return isoOfDayNumber(n - offset);
    }
  }
  throw new RangeError(`No such Hijri date: ${day} ${month} ${year}`);
}

/** 29 or 30 */
export function hijriMonthLength(year: number, month: number): number {
  const first = dayNumber(fromHijri(year, month, 1));
  const next = dayNumber(month === 12 ? fromHijri(year + 1, 1, 1) : fromHijri(year, month + 1, 1));
  return next - first;
}

export function isRamadan(date: CivilInput, offset = 0): boolean {
  return toHijri(date, offset).month === RAMADAN;
}

/** "3 Jumada al-Akhirah 1448" */
export function formatHijri(h: HijriDate): string {
  return `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year}`;
}
