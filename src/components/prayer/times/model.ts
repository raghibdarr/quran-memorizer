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
  /** It began earlier today and its time is over (or, for sunrise, the sun is up) */
  isPassed: boolean;
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

/**
 * The day's rows with any time that falls out of order dropped (shown as "no time
 * today"), each row then ending where the next remaining time begins. Dhuhr, the
 * sun's highest point, is the anchor: the times before it must climb towards it,
 * the times after it must follow on. Far north in winter the automatic rule can
 * otherwise give an Asr before Dhuhr, which reads as a broken screen.
 */
export function inOrder<R extends { name: TimeName; startMs: number | null; endMs: number | null }>(rows: R[]): R[] {
  const out = rows.map((r) => ({ ...r }));
  const noon = out.findIndex((r) => r.name === 'dhuhr');
  if (noon < 0 || out[noon].startMs === null) return out;
  let bound = out[noon].startMs!;
  for (let i = noon - 1; i >= 0; i--) {
    const t = out[i].startMs;
    if (t === null) continue;
    if (t < bound) bound = t;
    else out[i].startMs = null;
  }
  bound = out[noon].startMs!;
  for (let i = noon + 1; i < out.length; i++) {
    const t = out[i].startMs;
    if (t === null) continue;
    if (t > bound) bound = t;
    else out[i].startMs = null;
  }
  // A row whose following time was dropped ends where the next kept one begins
  for (let i = 0; i < out.length - 1; i++) {
    if (rows[i + 1].startMs === out[i + 1].startMs) continue;
    const later = out.slice(i + 1).find((r) => r.startMs !== null);
    out[i].endMs = later ? later.startMs : rows[rows.length - 1].endMs;
  }
  return out;
}

/** Everything the /prayer hub shows at `now` */
export function buildHub(place: Where, s: ModelSettings, now: number): HubModel {
  const iso = isoInTz(now, place.tz);
  const next = nextPrayer(place, s, now);
  const raw = prayerRows(place, iso, s);
  const kept = inOrder(raw);
  const dropped = (name: TimeName) => kept.find((r) => r.name === name)!.startMs === null && raw.find((r) => r.name === name)!.startMs !== null;
  const engineCurrent = currentPrayer(place, s, now);
  // The engine's "now" can land on a dropped time; then "now" is the kept prayer whose time is in, if any
  let current = engineCurrent;
  if (engineCurrent && engineCurrent.iso === iso && dropped(engineCurrent.prayer)) {
    const inNow = kept.find((r) => r.name !== 'sunrise' && r.startMs !== null && r.endMs !== null && now >= r.startMs && now < r.endMs);
    current = inNow ? { prayer: inNow.name as PrayerName, startMs: inNow.startMs!, endMs: inNow.endMs!, iso } : null;
  }
  const rows = kept.map((r) => {
    const isNext = !!next && next.iso === iso && next.prayer === r.name;
    const isCurrent = !!current && current.iso === iso && current.prayer === r.name;
    return {
      ...r,
      isNext,
      isCurrent,
      isPassed: !isNext && !isCurrent && r.startMs !== null && r.startMs <= now,
      dayShift: dayShiftOf(r.startMs, iso, place.tz),
    };
  });
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

