// Day-string helpers for the worship screens. Day strings (YYYY-MM-DD) are
// calendar labels: formatted at UTC noon so no device zone can shift them.

const at = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

/** "Tue 3 Nov" */
export function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(at(iso));
}

/** "3 November" */
export function longDayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(at(iso));
}

/** "November 2026" for a YYYY-MM month */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(at(`${month}-01`));
}

/** The calendar day an instant falls on in an IANA zone (the device's when tz is empty) */
export function isoInZone(ms: number, tz?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  }
}

/** Days in a YYYY-MM month */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Monday-first column (0..6) of a day */
export function mondayColumn(iso: string): number {
  return (at(iso).getUTCDay() + 6) % 7;
}

/** The month before or after a YYYY-MM month */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
