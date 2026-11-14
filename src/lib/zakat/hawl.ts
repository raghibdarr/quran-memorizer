// The zakat year (hawl): a lunar year counted from the day the user's wealth
// first reached nisab. Anniversaries come from the Hijri calendar in
// src/lib/hijri/convert.ts, so they are calculated, not sighted: the screen
// labels them "expected", and the user's Hijri day offset (prayer settings)
// lines them up with their local announcement.

import { formatHijri, fromHijri, hijriMonthLength, toHijri, type HijriDate } from '@/lib/hijri/convert';
import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import { NOTIFY_RANGES } from '@/lib/notify/registry';
import { addDaysIso, isoFromMs } from '@/lib/dates';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The reminder's id: the first in the shared reminders range (spec 3.6) */
export const HAWL_REMINDER_ID = NOTIFY_RANGES.reminders.start;

/** Local hour the reminder fires on the expected day */
export const HAWL_REMINDER_HOUR = 9;

export interface HawlAnniversary {
  /** Civil date, 'YYYY-MM-DD' */
  iso: string;
  hijri: HijriDate;
  /** 1 for the first anniversary after the start, and so on */
  years: number;
}

/** The civil date of a Hijri day, moved back to the month's last day when the month is shorter */
function civilOf(year: number, month: number, day: number, offset: number): { iso: string; hijri: HijriDate } {
  const d = Math.min(day, hijriMonthLength(year, month));
  return { iso: fromHijri(year, month, d, offset), hijri: { year, month, day: d } };
}

/**
 * The first lunar anniversary of `startIso` that falls on or after `todayIso`
 * (the day a zakat year completes). Null for a malformed date.
 */
export function nextHawlDate(startIso: string, todayIso: string, offset = 0): HawlAnniversary | null {
  if (!ISO.test(startIso) || !ISO.test(todayIso)) return null;
  try {
    const start = toHijri(startIso, offset);
    if (start.year < 1) return null; // a date before the Hijri calendar: a typo, not a zakat year
    // Start from this Hijri year (no walking through every year since the start);
    // the anniversary is this year's or, when that has passed, next year's
    const first = Math.max(1, toHijri(todayIso, offset).year - start.year);
    for (let years = first; years <= first + 2; years++) {
      const { iso, hijri } = civilOf(start.year + years, start.month, start.day, offset);
      if (iso >= todayIso) return { iso, hijri, years };
    }
  } catch {
    // A date the calendar can't place (far outside its range)
  }
  return null;
}

/** "3 Rajab 1448" for the start date, under the user's offset */
export function hijriLabel(iso: string, offset = 0): string {
  if (!ISO.test(iso)) return '';
  try {
    const h = toHijri(iso, offset);
    return h.year < 1 ? '' : formatHijri(h);
  } catch {
    return '';
  }
}

/**
 * The hawl reminder as a local notification, or none: off, no start date, or
 * the expected day's reminder time already passed. Pure; the OS glue hands the
 * result to applyRange(NOTIFY_RANGES.reminders, …).
 */
export function planHawlReminder(opts: {
  enabled: boolean;
  hawlStartIso: string | null;
  now: Date;
  offset?: number;
}): LocalNotificationSchema[] {
  const { enabled, hawlStartIso, now, offset = 0 } = opts;
  if (!enabled || !hawlStartIso) return [];
  const today = isoFromMs(now.getTime());
  let next = nextHawlDate(hawlStartIso, today, offset);
  if (!next) return [];
  let at = atLocalHour(next.iso, HAWL_REMINDER_HOUR);
  if (at.getTime() <= now.getTime()) {
    // Today is the day but the hour has gone: remind on the following anniversary
    next = nextHawlDate(hawlStartIso, addDaysIso(next.iso, 1), offset);
    if (!next) return [];
    at = atLocalHour(next.iso, HAWL_REMINDER_HOUR);
  }
  return [
    {
      id: HAWL_REMINDER_ID,
      title: 'Your zakat year',
      body: `Your zakat year is expected to complete today, ${formatHijri(next.hijri)}. Open Takrar to work out what is due.`,
      schedule: { at, allowWhileIdle: true },
      extra: { url: '/zakat' },
    },
  ];
}

function atLocalHour(iso: string, hour: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}
