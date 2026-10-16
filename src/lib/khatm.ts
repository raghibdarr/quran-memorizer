// Khatm planner (roadmap #14): read the whole mushaf in N days — today's pages,
// how far ahead or behind, and where to pick up. Pure.

import { daysBetween, isoFromMs } from './dates';
import type { Khatm } from '@/stores/reader-store';

export const KHATM_PAGES = 604;

/** Which day of the khatm `now` is (0 = the day it started), in local days */
export function khatmDay(k: Khatm, now = Date.now()): number {
  return Math.max(0, daysBetween(isoFromMs(k.startedAt), isoFromMs(now)));
}

/** The pages set for a given day: [first, last], 1-based, inclusive */
export function portion(day: number, days: number): [number, number] {
  const first = Math.floor((day * KHATM_PAGES) / days) + 1;
  const last = Math.floor(((day + 1) * KHATM_PAGES) / days);
  return [Math.min(first, KHATM_PAGES), Math.min(Math.max(last, first), KHATM_PAGES)];
}

export interface KhatmStatus {
  day: number;
  /** 1-based day for display, capped at the plan's length */
  dayNo: number;
  today: [number, number];
  read: number;
  /** Pages that should have been read by the end of today */
  due: number;
  /** Positive: pages still to read to be on track today (incl. today's) */
  behind: number;
  todayLeft: number;
  /** First page not yet read (null when every page is) */
  nextPage: number | null;
  finished: boolean;
  overdue: boolean;
}

export function khatmStatus(k: Khatm, now = Date.now()): KhatmStatus {
  const day = khatmDay(k, now);
  const today = portion(Math.min(day, k.days - 1), k.days);
  const isRead = (p: number) => !!k.pagesRead[String(p)];
  let read = 0;
  let nextPage: number | null = null;
  for (let p = 1; p <= KHATM_PAGES; p++) {
    if (isRead(p)) read++;
    else if (nextPage === null) nextPage = p;
  }
  const due = day >= k.days ? KHATM_PAGES : portion(day, k.days)[1];
  let todayLeft = 0;
  for (let p = today[0]; p <= today[1]; p++) if (!isRead(p)) todayLeft++;
  return {
    day,
    dayNo: Math.min(day + 1, k.days),
    today,
    read,
    due,
    behind: Math.max(0, due - read),
    todayLeft,
    nextPage,
    finished: read >= KHATM_PAGES,
    overdue: day >= k.days && read < KHATM_PAGES,
  };
}

export const KHATM_PRESETS: { days: number; label: string; kind?: string }[] = [
  { days: 30, label: 'Ramadan · 30 days', kind: 'ramadan' },
  { days: 7, label: 'A week' },
  { days: 15, label: '15 days' },
  { days: 60, label: '2 months' },
  { days: 120, label: '4 months' },
  { days: 365, label: 'A year' },
];
