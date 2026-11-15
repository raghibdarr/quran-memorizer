// One week for every calendar in the app (Hijri month, prayer log, Progress):
// the same first day, from the device locale when the platform says (Intl
// weekInfo), else Monday; and one label format, "Mon".

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** 0 = Sunday … 6 = Saturday. Monday (ISO 8601) when the locale doesn't say */
export const DEFAULT_WEEK_START = 1;

type WeekInfo = { firstDay?: number };
type LocaleWithWeek = Intl.Locale & { weekInfo?: WeekInfo; getWeekInfo?: () => WeekInfo };

/** The locale's first day of the week (0 = Sunday … 6 = Saturday) */
export function localeWeekStart(locale?: string): number {
  try {
    const tag = locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
    if (!tag || typeof Intl.Locale !== 'function') return DEFAULT_WEEK_START;
    const loc = new Intl.Locale(tag) as LocaleWithWeek;
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
    const first = info?.firstDay;
    // Intl numbers the days 1 = Monday … 7 = Sunday
    return typeof first === 'number' && first >= 1 && first <= 7 ? first % 7 : DEFAULT_WEEK_START;
  } catch {
    return DEFAULT_WEEK_START;
  }
}

/** The labels in grid order for a week starting on `start` */
export function weekdayLabels(start: number): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(start + i) % 7]);
}

/** The grid column (0..6) of a weekday (0 = Sunday) in a week starting on `start` */
export function weekColumn(weekday: number, start: number): number {
  return (weekday - start + 7) % 7;
}

/** The weekday (0 = Sunday) of a YYYY-MM-DD civil date */
export function weekdayOfIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}
