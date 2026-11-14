// What the prayer screens and the Home strip show, worked out from the place,
// the settings and the clock. Pure, and loaded only by dynamic import
// (usePrayerModel), so adhan stays out of every first-load chunk: Home's in
// particular (scripts/check-bundle.mjs).

import {
  computeDay,
  currentPrayer,
  currentWindow,
  effectiveHighLatRule,
  formatTime,
  formatUntil,
  isoInTz,
  nextPrayer,
  prayerRows,
  type CurrentPrayer,
  type UpcomingPrayer,
} from '@/lib/prayer/engine';
import { formatHijri, isRamadan, toHijri } from '@/lib/hijri/convert';
import { TIME_LABELS, type Place, type PrayerCalcSettings, type PrayerName, type RamadanMode, type TimeName } from '@/types/prayer';

export { computeDay, effectiveHighLatRule, formatTime, formatUntil, isoInTz };

type Where = Pick<Place, 'lat' | 'lng' | 'tz'>;

export interface ModelSettings extends PrayerCalcSettings {
  hijriOffset: number;
  ramadanMode: RamadanMode;
}

export interface HubRow {
  name: TimeName;
  startMs: number | null;
  /** When the next time begins (Isha: the next day's Fajr) */
  endMs: number | null;
  /** The next prayer to come */
  isNext: boolean;
  /** Its time is in now */
  isCurrent: boolean;
  /**
   * The time falls on another calendar day at the place than the one listed: 1
   * when it is past midnight (a summer Isha far north), -1 when before the day began
   */
  dayShift: -1 | 0 | 1;
}

export interface HubModel {
  /** The place's calendar day */
  iso: string;
  rows: HubRow[];
  next: UpcomingPrayer | null;
  /** The next prayer falls on the place's next day (after Isha) */
  nextIsTomorrow: boolean;
  current: CurrentPrayer | null;
  window: 'morning' | 'evening' | null;
  /** Times that don't exist at this place today (high latitude) */
  missing: TimeName[];
  ramadan: boolean;
}

/** Ramadan as the user's setting has it: forced on or off, or by the Hijri date at the place */
export function inRamadan(place: Where, s: Pick<ModelSettings, 'ramadanMode' | 'hijriOffset'>, now: number): boolean {
  if (s.ramadanMode === 'on') return true;
  if (s.ramadanMode === 'off') return false;
  return isRamadan(isoInTz(now, place.tz), s.hijriOffset);
}

function dayShiftOf(ms: number | null, iso: string, tz: string): -1 | 0 | 1 {
  if (ms === null) return 0;
  const on = isoInTz(ms, tz);
  return on === iso ? 0 : on > iso ? 1 : -1;
}

/** Everything the /prayer hub shows at `now` */
export function buildHub(place: Where, s: ModelSettings, now: number): HubModel {
  const iso = isoInTz(now, place.tz);
  const next = nextPrayer(place, s, now);
  const current = currentPrayer(place, s, now);
  const rows = prayerRows(place, iso, s).map((r) => ({
    ...r,
    isNext: !!next && next.iso === iso && next.prayer === r.name,
    isCurrent: !!current && current.iso === iso && current.prayer === r.name,
    dayShift: dayShiftOf(r.startMs, iso, place.tz),
  }));
  return {
    iso,
    rows,
    next,
    nextIsTomorrow: !!next && next.iso > iso,
    current,
    window: currentWindow(place, s, now),
    missing: rows.filter((r) => r.startMs === null).map((r) => r.name),
    ramadan: inRamadan(place, s, now),
  };
}

export interface StripLine {
  /** "Asr", or "Iftar" for Maghrib in Ramadan */
  label: string;
  time: string;
  until: string;
  prayer: PrayerName;
}

/** The Home strip: "Asr 15:12 · in 1 h 4 min" (in Ramadan, Maghrib reads "Iftar") */
export function stripLine(place: Where, s: ModelSettings, now: number, hour12 = false): StripLine | null {
  const next = nextPrayer(place, s, now);
  if (!next) return null;
  const iftar = next.prayer === 'maghrib' && inRamadan(place, s, now);
  return {
    label: iftar ? 'Iftar' : TIME_LABELS[next.prayer],
    time: formatTime(next.at, place.tz, { hour12 }),
    until: formatUntil(next.at, now),
    prayer: next.prayer,
  };
}

/** Today's six times for a settings preview (null where a time doesn't exist) */
export function dayTimes(place: Where, s: PrayerCalcSettings, now: number) {
  return computeDay(place, isoInTz(now, place.tz), s);
}

/** "12 Jumada al-Akhirah 1448" for the place's day */
export function hijriToday(place: Where, offset: number, now: number): string {
  return formatHijri(toHijri(isoInTz(now, place.tz), offset));
}

/** Minutes a zone is ahead of UTC at an instant */
export function zoneOffsetMin(tz: string, ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return Math.round((asUtc - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/**
 * The phone's clock is on another zone than the place (a trip, most likely).
 * Zones with the same offset right now (London and Dublin) don't count.
 */
export function zoneDiffers(placeTz: string, deviceTz: string, now: number): boolean {
  if (!deviceTz || deviceTz === placeTz) return false;
  try {
    return zoneOffsetMin(placeTz, now) !== zoneOffsetMin(deviceTz, now);
  } catch {
    return false;
  }
}

