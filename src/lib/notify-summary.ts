/**
 * What the server-side reminders know about a user (M8): read from their synced
 * stores (user_data rows) by the Netlify scheduled functions. Pure and dependency-
 * free so those functions can import it directly.
 */

const DAY = 864e5;

/** Local wall-clock parts in an IANA zone (falls back to UTC for an unknown zone) */
function parts(tz: string, now: number): { date: string; hour: number; secondsIntoDay: number } {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  } catch {
    return parts('UTC', now);
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, hour, secondsIntoDay: hour * 3600 + Number(p.minute) * 60 + Number(p.second) };
}

export const localHour = (tz: string, now = Date.now()) => parts(tz, now).hour;
export const localDate = (tz: string, now = Date.now()) => parts(tz, now).date;

interface Due { nextReview?: number }

/** Lesson and ayah reviews due by the end of the user's local today */
export function dueToday(reviews: { cards?: Due[]; lessonCards?: Due[] } | null | undefined, tz: string, now = Date.now()) {
  const endOfDay = now + (DAY - parts(tz, now).secondsIntoDay * 1000);
  const due = (list?: Due[]) => (list ?? []).filter((c) => (c.nextReview ?? Infinity) <= endOfDay).length;
  return { lessons: due(reviews?.lessonCards), ayahs: due(reviews?.cards) };
}

/** Whole days since the user's last active local date (stats.lastActiveDate, YYYY-MM-DD); null if never */
export function daysAway(lastActiveDate: string | null | undefined, tz: string, now = Date.now()): number | null {
  if (!lastActiveDate) return null;
  const today = Date.parse(`${localDate(tz, now)}T00:00:00Z`);
  const last = Date.parse(`${lastActiveDate}T00:00:00Z`);
  return Number.isFinite(last) ? Math.round((today - last) / DAY) : null;
}

/** The reminder's words: lessons first (that's what the Review tab leads with) */
export function reminderText(due: { lessons: number; ayahs: number }): { title: string; body: string } {
  const what = due.lessons > 0
    ? `${due.lessons} ${due.lessons === 1 ? 'lesson' : 'lessons'} to review`
    : `${due.ayahs} ${due.ayahs === 1 ? 'ayah' : 'ayahs'} to review`;
  return { title: 'Time to revise', body: `${what} today. A few minutes keeps them strong.` };
}

/** Weekly digest: only for someone away a week or more with reviews piling up, at most once a week */
export function wantsDigest(opts: { daysAway: number | null; due: { lessons: number; ayahs: number }; lastDigestAt: number | null; now?: number }): boolean {
  const now = opts.now ?? Date.now();
  if (opts.daysAway == null || opts.daysAway < 8) return false;
  if (opts.due.lessons + opts.due.ayahs === 0) return false;
  return opts.lastDigestAt == null || now - opts.lastDigestAt >= 6.5 * DAY;
}
