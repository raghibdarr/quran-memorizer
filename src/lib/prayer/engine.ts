// The prayer-time engine (all-in-one spec 3.3): adhan-js, on the device, nothing
// sent anywhere. Every time is an epoch ms instant; every display goes through
// formatTime in the PLACE's IANA zone (never the device's: a user can look up a
// city they're travelling to).
//
// Load this module with a dynamic import (`await import('@/lib/prayer/engine')`)
// from anything Home renders: adhan must stay out of Home's first-load chunks
// (scripts/check-bundle.mjs fails the build check otherwise).

import {
  CalculationMethod,
  CalculationParameters,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PolarCircleResolution,
  PrayerTimes,
  Qibla,
} from 'adhan';
import { addDaysIso } from '@/lib/dates';
import {
  PRAYER_NAMES,
  TIME_NAMES,
  type HighLatRule,
  type Place,
  type PrayerCalcSettings,
  type PrayerName,
  type TimeName,
} from '@/types/prayer';

export type DayTimes = Record<TimeName, number | null>;

type Where = Pick<Place, 'lat' | 'lng' | 'tz'>;

const MIN = 60_000;

/** The calendar day (YYYY-MM-DD) an instant falls on in an IANA zone */
export function isoInTz(ms: number, tz: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

/** The high-latitude rule actually used ('auto' resolved for the place) */
export function effectiveHighLatRule(place: Pick<Place, 'lat' | 'lng'>, rule: HighLatRule): Exclude<HighLatRule, 'auto'> {
  if (rule !== 'auto') return rule;
  // adhan only looks north of 48°: the far south (Ushuaia, Punta Arenas) needs the same care
  return HighLatitudeRule.recommended(new Coordinates(Math.abs(place.lat), place.lng));
}

function paramsFor(place: Pick<Place, 'lat' | 'lng'>, settings: PrayerCalcSettings): CalculationParameters {
  let params: CalculationParameters;
  if (settings.method === 'custom') {
    const a = settings.customAngles ?? { fajr: 18, isha: 17 };
    params = new CalculationParameters('Other', a.fajr, a.ishaInterval ? 0 : a.isha, a.ishaInterval ?? 0);
  } else {
    params = CalculationMethod[settings.method]();
  }
  params.madhab = settings.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = effectiveHighLatRule(place, settings.highLatRule);
  // 'auto' also borrows the nearest day with a sunrise and sunset when the sun
  // doesn't rise or set (inside the polar circles); a chosen rule leaves those null
  if (settings.highLatRule === 'auto') params.polarCircleResolution = PolarCircleResolution.AqrabYaum;
  return params;
}

const valid = (d: Date | undefined): number | null => {
  const t = d ? d.getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * The six times for one calendar day at the place: epoch ms, or null when a
 * time doesn't exist there that day (high latitude). The user's per-prayer
 * offsets are applied last, after adhan's own method adjustments and rounding.
 */
export function computeDay(place: Where, iso: string, settings: PrayerCalcSettings): DayTimes {
  const coords = new Coordinates(place.lat, place.lng);
  const params = paramsFor(place, settings);
  const timesFor = (dayIso: string) => {
    const [y, m, d] = dayIso.split('-').map(Number);
    // adhan reads the date's local calendar fields; noon keeps them right even where
    // a DST change skips midnight
    return new PrayerTimes(coords, new Date(y, m - 1, d, 12), params);
  };
  let times = timesFor(iso);
  // adhan works from the UTC date, so where the civil date runs a day ahead of
  // (or behind) the sun's (Tonga, Samoa, Kiritimati: UTC+13/+14 at western
  // longitudes) it answers with the neighbouring day. Dhuhr always exists: if it
  // lands on another local day, ask for the day that lands on this one.
  const dhuhr = valid(times.dhuhr);
  if (dhuhr !== null) {
    const got = safeIsoInTz(dhuhr, place.tz);
    if (got && got !== iso) {
      const shift = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${got}T00:00:00Z`)) / 86_400_000);
      if (Math.abs(shift) === 1) times = timesFor(addDaysIso(iso, shift));
    }
  }
  const out = {} as DayTimes;
  for (const name of TIME_NAMES) {
    const t = valid(times[name]);
    out[name] = t === null ? null : t + (settings.offsets?.[name] ?? 0) * MIN;
  }
  return out;
}

/** isoInTz, or null for a zone name the platform doesn't know */
function safeIsoInTz(ms: number, tz: string): string | null {
  try {
    return isoInTz(ms, tz);
  } catch {
    return null;
  }
}

export interface PrayerRow {
  name: TimeName;
  startMs: number | null;
  /** When the next time begins (Isha runs to the next day's Fajr) */
  endMs: number | null;
}

/** The day's six rows with the end of each window, for the /prayer list */
export function prayerRows(place: Where, iso: string, settings: PrayerCalcSettings): PrayerRow[] {
  const day = computeDay(place, iso, settings);
  const nextFajr = computeDay(place, addDaysIso(iso, 1), settings).fajr;
  return TIME_NAMES.map((name, i) => ({
    name,
    startMs: day[name],
    endMs: i < TIME_NAMES.length - 1 ? day[TIME_NAMES[i + 1]] : nextFajr,
  }));
}

export interface UpcomingPrayer {
  prayer: PrayerName;
  at: number;
  /** The place's calendar day the prayer belongs to */
  iso: string;
}

/** The next of the five prayers after `now` (sunrise is not a prayer) */
export function nextPrayer(place: Where, settings: PrayerCalcSettings, now: number): UpcomingPrayer | null {
  const today = isoInTz(now, place.tz);
  for (let i = -1; i <= 2; i++) {
    const iso = addDaysIso(today, i);
    const day = computeDay(place, iso, settings);
    for (const prayer of PRAYER_NAMES) {
      const at = day[prayer];
      if (at !== null && at > now) return { prayer, at, iso };
    }
  }
  return null;
}

export interface CurrentPrayer {
  prayer: PrayerName;
  startMs: number;
  endMs: number;
  iso: string;
}

/** The prayer whose time `now` is inside (null between sunrise and Dhuhr) */
export function currentPrayer(place: Where, settings: PrayerCalcSettings, now: number): CurrentPrayer | null {
  const today = isoInTz(now, place.tz);
  for (const iso of [addDaysIso(today, -1), today]) {
    for (const row of prayerRows(place, iso, settings)) {
      if (row.name === 'sunrise' || row.startMs === null || row.endMs === null) continue;
      if (now >= row.startMs && now < row.endMs) return { prayer: row.name, startMs: row.startMs, endMs: row.endMs, iso };
    }
  }
  return null;
}

/** Which adhkar set fits now: morning from Fajr to sunrise, evening from Asr to Maghrib */
export function currentWindow(place: Where, settings: PrayerCalcSettings, now: number): 'morning' | 'evening' | null {
  const day = computeDay(place, isoInTz(now, place.tz), settings);
  const inside = (a: number | null, b: number | null) => a !== null && b !== null && now >= a && now < b;
  if (inside(day.fajr, day.sunrise)) return 'morning';
  if (inside(day.asr, day.maghrib)) return 'evening';
  return null;
}

/** Degrees clockwise from true north towards the Kaaba */
export function qiblaBearing(place: Pick<Place, 'lat' | 'lng'>): number {
  return Qibla(new Coordinates(place.lat, place.lng));
}

/** "15:12" (or "3:12 PM" with hour12) in the place's zone */
export function formatTime(ms: number, tz: string, opts: { hour12?: boolean } = {}): string {
  return new Intl.DateTimeFormat(opts.hour12 ? 'en-US' : 'en-GB', {
    timeZone: tz,
    hour: opts.hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hourCycle: opts.hour12 ? 'h12' : 'h23',
  }).format(ms);
}

/** "in 1 h 4 min", "in 12 min", "now" (rounded up to the minute) */
export function formatUntil(ms: number, now: number): string {
  const mins = Math.ceil((ms - now) / MIN);
  if (mins <= 0) return 'now';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `in ${m} min`;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}
