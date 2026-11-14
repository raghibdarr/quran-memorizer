// Runs of whole days (all five prayed, on time or late) in the prayer log. Shown
// gently and only when there is a run: the app never tells anyone a run ended
// (spec 1.6). A paused day is skipped as if it weren't there, so a pause never
// breaks a run and never lengthens one. Today only counts once it is whole; an
// unfinished today is still in progress, not a gap.

import { addDaysIso } from '@/lib/dates';
import { PRAYER_NAMES } from '@/types/prayer';
import type { Pause } from '@/stores/worship-store';
import { isPaused, type DayLog, type PrayerLog } from './log';

/** Longest look-back, so a pause left running for years can't stall a render */
const MAX_DAYS = 5000;

/** All five prayers marked prayed (on time or late) */
export function isWholeDay(day: DayLog | undefined): boolean {
  if (!day) return false;
  return PRAYER_NAMES.every((p) => day[p]?.s === 'ontime' || day[p]?.s === 'late');
}

function earliest(log: PrayerLog): string | null {
  let min: string | null = null;
  for (const iso of Object.keys(log)) if (min === null || iso < min) min = iso;
  return min;
}

/** Whole days in a row up to today (or yesterday while today is unfinished) */
export function currentRun(log: PrayerLog, pauses: readonly Pause[], todayIso: string): number {
  const first = earliest(log);
  if (first === null) return 0;
  let run = 0;
  let iso = todayIso;
  for (let i = 0; i < MAX_DAYS && iso >= first; i++, iso = addDaysIso(iso, -1)) {
    if (isPaused(iso, pauses)) continue;
    if (isWholeDay(log[iso])) run++;
    else if (iso !== todayIso) break;
  }
  return run;
}

/** The longest run of whole days anywhere in the log, up to today */
export function longestRun(log: PrayerLog, pauses: readonly Pause[], todayIso: string): number {
  const first = earliest(log);
  if (first === null) return 0;
  let best = 0;
  let run = 0;
  let iso = first;
  for (let i = 0; i < MAX_DAYS && iso <= todayIso; i++, iso = addDaysIso(iso, 1)) {
    if (isPaused(iso, pauses)) continue;
    if (isWholeDay(log[iso])) best = Math.max(best, ++run);
    else if (iso !== todayIso) run = 0;
  }
  return best;
}
