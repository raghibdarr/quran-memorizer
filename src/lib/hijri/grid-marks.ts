// The marks on /calendar's month grid: a dot for a single day or a short run,
// a line under the dates for a run of several days, and nothing for a run that
// fills the month (its title already says it). Weekly fasts get no mark.

import type { GridDay, MonthGrid } from './calendar';
import { eventsOnHijri, isWeekly } from './events';

/** A run this long covers the month (Ramadan, the six of Shawwal): the month title says it, so no mark */
const WHOLE_MONTH = 20;
/** Runs up to this long (the white days, tashriq) are dotted like single days */
const SHORT_RUN = 3;

export type MarkKind = 'occasion' | 'fast';

export interface DayMarks {
  /** A single day or a short run: gold for an occasion, teal for a voluntary fast */
  dot: MarkKind | null;
  /** A run of several days (the last ten nights, the first ten of Dhul-Hijjah), drawn as a line under the dates */
  bar: { kind: MarkKind; start: boolean; end: boolean } | null;
}

/** Each day's marks; weekly fasts get none, and month-long runs are left to the month title */
export function gridMarks(grid: MonthGrid): Map<string, DayMarks> {
  const out = new Map<string, DayMarks>();
  for (const d of grid.days) out.set(d.iso, marksOf(d, grid.length));
  return out;
}

function marksOf(d: GridDay, monthLength: number): DayMarks {
  let dot: MarkKind | null = null;
  let bar: DayMarks['bar'] = null;
  for (const e of eventsOnHijri(d.hijri, d.weekday)) {
    if (isWeekly(e.when)) continue;
    const from = e.when.from;
    const to = Math.min(e.when.to ?? from, monthLength);
    const len = to - from + 1;
    const kind: MarkKind = e.voluntaryFast ? 'fast' : 'occasion';
    if (len >= WHOLE_MONTH) continue;
    if (len <= SHORT_RUN) {
      if (dot !== 'occasion') dot = kind;
    } else if (!bar || (bar.kind === 'fast' && kind === 'occasion')) {
      bar = { kind, start: d.hijri.day === from, end: d.hijri.day === to };
    }
  }
  return { dot, bar };
}
