// Expected Islamic occasions for /calendar (all-in-one spec 2.2), from our own
// list in src/data/hijri-events.json. Only occasions tied to a cited act of
// worship are listed; disputed observances are left out. Every date is
// calculated, so screens show them as "expected", shifted by the user's
// hijriOffset like every other Hijri date.

import data from '@/data/hijri-events.json';
import { RAMADAN, toHijri, type HijriDate } from './convert';
import { addDays, addHijriMonths, daysFrom, monthBounds, weekdayOf, type HijriMonthRef } from './calendar';

export interface QuranLead {
  surahId: number;
  ayah: number;
  ayahEnd?: number;
}

/** One fixed span in one Hijri month ("to" is clipped to the month's length) */
export interface AnnualWhen { month: number; from: number; to?: number }
/** The same days of every Hijri month */
export interface MonthlyWhen { everyMonth: true; from: number; to?: number }
/** Weekdays, 0 = Sunday … 6 = Saturday */
export interface WeeklyWhen { weekdays: number[] }

export type EventWhen = AnnualWhen | MonthlyWhen | WeeklyWhen;

export interface HijriEvent {
  id: string;
  title: string;
  when: EventWhen;
  /** One plain line */
  description: string;
  /** A Quran reference, rendered from the bundled surah files */
  quran?: QuranLead;
  /** A hadith citation lead; empty until confirmed in two witnesses */
  citation: string;
  /** A voluntary fast: not marked in Ramadan, on the two Eids or the days of tashriq */
  voluntaryFast?: boolean;
}

export const HIJRI_EVENTS: readonly HijriEvent[] = (data as { events: HijriEvent[] }).events;

export const isAnnual = (w: EventWhen): w is AnnualWhen => 'month' in w;
export const isMonthly = (w: EventWhen): w is MonthlyWhen => 'everyMonth' in w;
export const isWeekly = (w: EventWhen): w is WeeklyWhen => 'weekdays' in w;

/** A Hijri date with no voluntary-fast marks: Ramadan itself, both Eids and the days of tashriq */
export function noVoluntaryFastMark(h: Pick<HijriDate, 'month' | 'day'>): boolean {
  if (h.month === RAMADAN) return true;
  if (h.month === 10 && h.day === 1) return true;
  return h.month === 12 && h.day >= 10 && h.day <= 13;
}

function spanHas(from: number, to: number | undefined, day: number): boolean {
  return day >= from && day <= (to ?? from);
}

/** The events on one Hijri day (weekday 0 = Sunday, of the civil date it falls on) */
export function eventsOnHijri(h: HijriDate, weekday: number, events: readonly HijriEvent[] = HIJRI_EVENTS): HijriEvent[] {
  return events.filter((e) => {
    if (e.voluntaryFast && noVoluntaryFastMark(h)) return false;
    const w = e.when;
    if (isAnnual(w)) return w.month === h.month && spanHas(w.from, w.to, h.day);
    if (isMonthly(w)) return spanHas(w.from, w.to, h.day);
    return w.weekdays.includes(weekday);
  });
}

/** The events on a civil date under the user's offset */
export function eventsOn(iso: string, offset = 0, events: readonly HijriEvent[] = HIJRI_EVENTS): HijriEvent[] {
  return eventsOnHijri(toHijri(iso, offset), weekdayOf(iso), events);
}

export interface EventOccurrence {
  event: HijriEvent;
  /** First and last civil dates, 'YYYY-MM-DD' */
  first: string;
  last: string;
  /** The Hijri date of `first` */
  hijri: HijriDate;
}

/**
 * The annual and monthly events falling in one Hijri month, in date order
 * (weekly ones are left out: they'd crowd the list). A span is clipped to the
 * month's length and to the days a voluntary fast is marked on.
 */
export function occurrencesInMonth(ref: HijriMonthRef, offset = 0, events: readonly HijriEvent[] = HIJRI_EVENTS): EventOccurrence[] {
  const { first, length } = monthBounds(ref, offset);
  const out: EventOccurrence[] = [];
  for (const event of events) {
    const w = event.when;
    if (isWeekly(w)) continue;
    if (isAnnual(w) && w.month !== ref.month) continue;
    const days: number[] = [];
    for (let d = w.from; d <= Math.min(w.to ?? w.from, length); d++) {
      if (event.voluntaryFast && noVoluntaryFastMark({ month: ref.month, day: d })) continue;
      days.push(d);
    }
    if (!days.length) continue;
    out.push({
      event,
      first: addDays(first, days[0] - 1),
      last: addDays(first, days[days.length - 1] - 1),
      hijri: { year: ref.year, month: ref.month, day: days[0] },
    });
  }
  return out.sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
}

/**
 * The next annual occasions from `today` on (one still running counts), in date
 * order, each event once. Monthly and weekly fasts are left out.
 */
export function upcomingOccasions(today: string, offset = 0, limit = 6, events: readonly HijriEvent[] = HIJRI_EVENTS): EventOccurrence[] {
  const annual = events.filter((e) => isAnnual(e.when));
  const start = toHijri(today, offset);
  const seen = new Set<string>();
  const out: EventOccurrence[] = [];
  // Thirteen months always reaches every annual occasion once
  for (let i = 0; i <= 13 && seen.size < annual.length; i++) {
    const ref = addHijriMonths({ year: start.year, month: start.month }, i);
    for (const o of occurrencesInMonth(ref, offset, annual)) {
      if (seen.has(o.event.id) || o.last < today) continue;
      seen.add(o.event.id);
      out.push(o);
    }
  }
  return out.sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0)).slice(0, limit);
}

/** "Quran 2:183–185" */
export function formatQuranLead(q: QuranLead): string {
  return `Quran ${q.surahId}:${q.ayah}${q.ayahEnd && q.ayahEnd !== q.ayah ? `–${q.ayahEnd}` : ''}`;
}

/** Days from today to an occurrence's first day (0 = today or already running) */
export function daysUntil(today: string, o: EventOccurrence): number {
  return Math.max(0, daysFrom(today, o.first));
}

/** Problems with an events list (empty when it's sound); the unit tests hold the shipped list to this */
export function validateEvents(events: readonly HijriEvent[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const dayOk = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 30;
  for (const e of events) {
    if (!/^[a-z0-9-]+$/.test(e.id)) errors.push(`${e.id}: invalid id`);
    if (ids.has(e.id)) errors.push(`${e.id}: duplicate id`);
    ids.add(e.id);
    if (!e.title?.trim()) errors.push(`${e.id}: no title`);
    if (!e.description?.trim() || e.description.length > 140 || /\n/.test(e.description)) errors.push(`${e.id}: description must be one short line`);
    if (typeof e.citation !== 'string') errors.push(`${e.id}: citation must be a string (empty when unconfirmed)`);
    const w = e.when;
    if (isAnnual(w)) {
      if (!Number.isInteger(w.month) || w.month < 1 || w.month > 12) errors.push(`${e.id}: invalid month`);
      if (!dayOk(w.from) || (w.to !== undefined && (!dayOk(w.to) || w.to < w.from))) errors.push(`${e.id}: invalid days`);
    } else if (isMonthly(w)) {
      if (!dayOk(w.from) || (w.to !== undefined && (!dayOk(w.to) || w.to < w.from))) errors.push(`${e.id}: invalid days`);
    } else if (isWeekly(w)) {
      if (!w.weekdays.length || w.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.push(`${e.id}: invalid weekdays`);
    } else {
      errors.push(`${e.id}: unknown when`);
    }
  }
  return errors;
}
