// Match my mosque (all-in-one spec 2.7, 6): fit the calculation to a mosque's
// printed START times. Pure: the user types two to five start times for one or
// two dates; we try every method x Asr position x high-latitude rule, fit a
// per-prayer offset to each, and keep the one that lines up best. If even the
// best preset leaves Fajr or Isha more than 3 minutes out, we solve our own
// Fajr and Isha angles by bisection and keep them when they follow the dates
// clearly better than an offset does.
//
// All minutes here are minutes after midnight on the PLACE's clock (the time a
// mosque prints), so no time-zone maths beyond reading the engine's instants.

import { computeDay } from './engine';
import { methodInfo, NAMED_METHODS } from './methods';
import { regionDefault } from './regions';
import {
  PRAYER_NAMES,
  type AsrMadhab,
  type CustomAngles,
  type HighLatRule,
  type MethodId,
  type Place,
  type PrayerCalcSettings,
  type PrayerName,
  type PrayerOffsets,
} from '@/types/prayer';

type Where = Pick<Place, 'lat' | 'lng' | 'tz'> & { countryCode?: string };

/** Minutes after midnight, place time, for each prayer the user filled in */
export type EnteredTimes = Partial<Record<PrayerName, number>>;

export interface MatchDay {
  /** YYYY-MM-DD, the place's calendar day the timetable row is for */
  iso: string;
  times: EnteredTimes;
}

export interface MatchCell {
  iso: string;
  prayer: PrayerName;
  entered: number;
  /** What the fitted settings give (minutes after midnight), null if no time that day */
  after: number | null;
  /** after minus entered, minutes (null with after) */
  diff: number | null;
}

export interface MatchResult {
  /** Ready for prayer-store applyCalc */
  calc: PrayerCalcSettings;
  /** One cell per entered time, in date then prayer order */
  cells: MatchCell[];
  /** Sum of |after - entered| over every entered time */
  totalOff: number;
  /** The largest |after - entered| */
  maxOff: number;
  /** True when Fajr or Isha uses our own solved angles */
  customAngles: boolean;
  /** One plain line on how sure the fit is */
  confidence: string;
  /** Set when the times look like jama'ah times rather than start times */
  lateHint: boolean;
}

/** Offsets are clamped to the prayer store's limit (prayer-store MAX_OFFSET_MIN) */
const OFFSET_LIMIT = 60;
/** Each non-zero offset costs this much, so a preset that needs fewer offsets wins */
const OFFSET_PENALTY = 0.25;
/**
 * Offsets up to this size are ordinary mosque adjustments and cost the same;
 * each minute beyond it costs a little more, since an offset that large usually
 * means the wrong method (or a jama'ah time)
 */
const PLAIN_OFFSET_MIN = 10;
const LARGE_OFFSET_PER_MIN = 0.05;
/** Score for a prayer the candidate can't compute that day (high latitude) */
const MISSING_COST = 60;
/** Fajr or Isha further out than this, after the best preset, tries custom angles */
const CUSTOM_TRIGGER_MIN = 3;
/** ...and keeps them only if Fajr and Isha then line up at least this many minutes better */
const CUSTOM_MIN_GAIN = 2;
/** ...or if the best preset needs a Fajr or Isha offset bigger than this */
const LARGE_TWILIGHT_OFFSET = 10;
/** Offsets this large on Dhuhr, Asr or Maghrib suggest jama'ah times */
const LATE_HINT_MIN = 15;

/** A Fajr typed at or after this (20:00) is read as the evening before (far north, summer) */
const WRAP_FAJR_FROM = 20 * 60;
/** A Maghrib or Isha typed before this (04:00) is read as after midnight */
const WRAP_NIGHT_UNTIL = 4 * 60;

const HIGH_LAT_RULES: readonly HighLatRule[] = ['auto', 'middleofthenight', 'seventhofthenight', 'twilightangle'];
const ZERO_OFFSETS: PrayerOffsets = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };

const minuteFormatters = new Map<string, Intl.DateTimeFormat>();

/** Minutes after midnight that an instant shows on the place's clock */
export function minutesInTz(ms: number, tz: string): number {
  let f = minuteFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    minuteFormatters.set(tz, f);
  }
  let h = 0;
  let m = 0;
  for (const p of f.formatToParts(ms)) {
    if (p.type === 'hour') h = Number(p.value) % 24;
    else if (p.type === 'minute') m = Number(p.value);
  }
  return h * 60 + m;
}

/** "05:07" → 307; null for anything that isn't a 24-hour HH:MM */
export function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 307 → "05:07" */
export function formatHm(minutes: number): string {
  const t = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** The five prayers for a day as minutes after midnight, place time */
export function dayMinutes(place: Where, iso: string, settings: PrayerCalcSettings): Record<PrayerName, number | null> {
  const day = computeDay(place, iso, settings);
  const out = {} as Record<PrayerName, number | null>;
  for (const p of PRAYER_NAMES) {
    const ms = day[p];
    out[p] = ms === null ? null : minutesInTz(ms, place.tz);
  }
  return out;
}

/** a - b on a 24-hour clock, in (-720, 720] (Isha can fall after midnight) */
function clockDiff(a: number, b: number): number {
  let d = a - b;
  while (d > 720) d -= 1440;
  while (d <= -720) d += 1440;
  return d;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** What the user typed is usable: one or two distinct dates, each with 2+ times in order */
export function checkMatchInput(days: MatchDay[]): string | null {
  if (days.length === 0 || days.length > 2) return 'Enter times for one or two dates.';
  if (days.length === 2 && days[0].iso === days[1].iso) return 'Pick two different dates.';
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.iso)) return 'Pick a date.';
    const filled = PRAYER_NAMES.filter((p) => typeof d.times[p] === 'number');
    if (filled.length < 2) return 'Enter at least two start times for each date.';
    // The times run in order through the day. Far north in summer the row wraps
    // round midnight: Fajr can start late the evening before, and Maghrib or Isha
    // can land in the small hours (Reykjavik's June sunset is just after 00:00).
    // Unwrap those on to one line before comparing; Dhuhr and Asr never wrap.
    const line = PRAYER_NAMES.filter((p) => typeof d.times[p] === 'number').map((p) => {
      const t = d.times[p]!;
      if (p === 'fajr' && t >= WRAP_FAJR_FROM) return t - 1440;
      if ((p === 'maghrib' || p === 'isha') && t < WRAP_NIGHT_UNTIL) return t + 1440;
      return t;
    });
    for (let i = 1; i < line.length; i++) {
      if (line[i] <= line[i - 1]) return 'Check the times: they should run Fajr, Dhuhr, Asr, Maghrib, Isha through the day.';
    }
  }
  return null;
}

interface Fit {
  calc: PrayerCalcSettings;
  /** Minutes still off after the offsets, summed */
  mismatch: number;
  /** The same, per prayer */
  off: Partial<Record<PrayerName, number>>;
  score: number;
  /** Per prayer, the residuals (entered - computed, before offsets) per date */
  residuals: Partial<Record<PrayerName, number[]>>;
  /** Tie-break rank: lower is preferred */
  rank: number;
  sumAbsOffsets: number;
}

/**
 * Fit offsets to one candidate: residual per prayer = entered - computed, the
 * offset is the rounded median residual across dates, and the score is the
 * minutes left over plus a small cost per non-zero offset.
 */
function fitCandidate(place: Where, days: MatchDay[], base: Omit<PrayerCalcSettings, 'offsets'>, rank: number): Fit {
  const calc0: PrayerCalcSettings = { ...base, offsets: ZERO_OFFSETS };
  const computed = days.map((d) => dayMinutes(place, d.iso, calc0));
  const offsets: PrayerOffsets = { ...ZERO_OFFSETS };
  const residuals: Fit['residuals'] = {};
  const offBy: Fit['off'] = {};
  let mismatch = 0;
  let penalty = 0;
  let sumAbsOffsets = 0;
  for (const p of PRAYER_NAMES) {
    const rs: number[] = [];
    let missing = 0;
    days.forEach((d, i) => {
      const entered = d.times[p];
      if (typeof entered !== 'number') return;
      const c = computed[i][p];
      if (c === null) missing++;
      else rs.push(clockDiff(entered, c));
    });
    mismatch += missing * MISSING_COST;
    offBy[p] = missing * MISSING_COST;
    if (rs.length === 0) continue;
    residuals[p] = rs;
    const off = clamp(Math.round(median(rs)), -OFFSET_LIMIT, OFFSET_LIMIT);
    offsets[p] = off;
    for (const r of rs) offBy[p]! += Math.abs(r - off);
    mismatch += offBy[p]!;
    if (off !== 0) penalty += OFFSET_PENALTY + LARGE_OFFSET_PER_MIN * Math.max(0, Math.abs(off) - PLAIN_OFFSET_MIN);
    sumAbsOffsets += Math.abs(off);
  }
  return { calc: { ...base, offsets }, mismatch, off: offBy, score: mismatch + penalty, residuals, rank, sumAbsOffsets };
}

const EPS = 1e-9;
function better(a: Fit, b: Fit): boolean {
  if (Math.abs(a.score - b.score) > EPS) return a.score < b.score;
  if (a.rank !== b.rank) return a.rank < b.rank;
  return a.sumAbsOffsets < b.sumAbsOffsets;
}

/** Largest |residual| (before offsets) for a prayer, 0 when not entered */
function worstRaw(fit: Fit, p: PrayerName): number {
  const rs = fit.residuals[p];
  return rs && rs.length ? Math.max(...rs.map(Math.abs)) : 0;
}

/**
 * The angle (degrees) at which the computed time crosses `target` on `iso`.
 * `increasing` says whether a bigger angle makes the time later (Isha) or
 * earlier (Fajr). Two bisections find where the rounded minute steps on to
 * and off the target; their midpoint is where the unrounded time hits it.
 * Null when no angle in range reaches the target.
 */
function solveAngle(
  timeAt: (angle: number) => number | null,
  target: number,
  increasing: boolean,
): number | null {
  const LO = 6;
  const HI = 24;
  // g(a) > 0 when the time at angle a is "past" the target in the direction the angle moves it
  const sign = (a: number, strict: boolean): boolean | null => {
    const t = timeAt(a);
    if (t === null) return null;
    const d = clockDiff(t, target) * (increasing ? 1 : -1);
    return strict ? d > 0 : d >= 0;
  };
  const edge = (strict: boolean): number | null => {
    let lo = LO;
    let hi = HI;
    const sLo = sign(lo, strict);
    const sHi = sign(hi, strict);
    if (sLo === null || sHi === null || sLo === sHi || sLo) return null;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const s = sign(mid, strict);
      if (s === null) return null;
      if (s) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const onto = edge(false); // first angle that reaches the target minute
  const past = edge(true); // first angle past it
  if (onto === null || past === null) return null;
  return (onto + past) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Our own Fajr and Isha angles fitted to the entered times, as a custom calculation */
function customCandidate(place: Where, days: MatchDay[], preset: Fit): Omit<PrayerCalcSettings, 'offsets'> | null {
  const info = preset.calc.method === 'custom' ? null : methodInfo(preset.calc.method);
  const presetFajr = preset.calc.customAngles?.fajr ?? info?.fajrAngle ?? 18;
  const presetIsha = preset.calc.customAngles?.isha ?? info?.ishaAngle ?? 18;
  const presetInterval = preset.calc.customAngles?.ishaInterval ?? info?.ishaInterval;
  const common = { method: 'custom' as MethodId, madhab: preset.calc.madhab, highLatRule: preset.calc.highLatRule };

  const solveFor = (p: 'fajr' | 'isha'): number | null => {
    const angles: number[] = [];
    for (const d of days) {
      const target = d.times[p];
      if (typeof target !== 'number') continue;
      const timeAt = (angle: number) => {
        const angles: CustomAngles = p === 'fajr' ? { fajr: angle, isha: presetIsha } : { fajr: presetFajr, isha: angle };
        return dayMinutes(place, d.iso, { ...common, offsets: ZERO_OFFSETS, customAngles: angles })[p];
      };
      const a = solveAngle(timeAt, target, p === 'isha');
      if (a !== null) angles.push(a);
    }
    return angles.length ? round1(angles.reduce((s, a) => s + a, 0) / angles.length) : null;
  };

  const fajrOff = worstRaw(preset, 'fajr') > CUSTOM_TRIGGER_MIN;
  const ishaOff = worstRaw(preset, 'isha') > CUSTOM_TRIGGER_MIN;
  const fajr = preset.residuals.fajr ? solveFor('fajr') : null;
  if (fajrOff && fajr === null) return null;
  // An interval Isha (Umm al-Qura, Qatar) stays an interval, with its offset folded in
  if (presetInterval !== undefined) {
    const interval = clamp(presetInterval + preset.calc.offsets.isha, 1, 180);
    return { ...common, customAngles: { fajr: fajr ?? presetFajr, isha: presetIsha, ishaInterval: interval } };
  }
  const isha = preset.residuals.isha ? solveFor('isha') : null;
  if (ishaOff && isha === null) return null;
  return { ...common, customAngles: { fajr: fajr ?? presetFajr, isha: isha ?? presetIsha } };
}

/**
 * Fit a mosque's start times. `days` holds one or two dates; each date needs at
 * least two of the five start times (checkMatchInput says what's wrong).
 * Returns null when the input can't be fitted.
 */
export function matchMosque(place: Where, days: MatchDay[]): MatchResult | null {
  if (checkMatchInput(days)) return null;
  const region = regionDefault(place.countryCode);

  let best: Fit | null = null;
  for (const method of NAMED_METHODS) {
    for (const madhab of ['standard', 'hanafi'] as AsrMadhab[]) {
      for (const highLatRule of HIGH_LAT_RULES) {
        // The regional default (method, then Asr position) and the automatic
        // high-latitude rule win ties
        const rank = (method === region.method ? 0 : 4) + (madhab === region.madhab ? 0 : 2) + (highLatRule === 'auto' ? 0 : 1);
        const fit = fitCandidate(place, days, { method, madhab, highLatRule }, rank);
        if (!best || better(fit, best)) best = fit;
      }
    }
  }
  if (!best) return null;

  let chosen = best;
  let usedCustom = false;
  const needsCustom =
    worstRaw(best, 'fajr') > CUSTOM_TRIGGER_MIN || worstRaw(best, 'isha') > CUSTOM_TRIGGER_MIN;
  if (needsCustom) {
    const base = customCandidate(place, days, best);
    if (base) {
      const fit = fitCandidate(place, days, base, best.rank);
      const twilight = (f: Fit) => (f.off.fajr ?? 0) + (f.off.isha ?? 0);
      const bigOffset = Math.max(Math.abs(best.calc.offsets.fajr), Math.abs(best.calc.offsets.isha)) > LARGE_TWILIGHT_OFFSET;
      // Keep our angles when they follow the dates clearly better than the
      // preset with offsets (by more than rounding can explain), or when the
      // preset needs so large a Fajr or Isha offset that a different angle is
      // the likelier story (a big offset drifts badly as the seasons turn).
      // Within a few minutes, one date can't tell an angle from an offset, so
      // the preset stays.
      if (
        fit.mismatch <= best.mismatch &&
        (twilight(fit) + CUSTOM_MIN_GAIN <= twilight(best) || (bigOffset && twilight(fit) <= twilight(best)))
      ) {
        chosen = fit;
        usedCustom = true;
      }
    }
  }

  // Report against the fitted calculation, as the app will show it
  const cells: MatchCell[] = [];
  for (const d of days) {
    const after = dayMinutes(place, d.iso, chosen.calc);
    for (const p of PRAYER_NAMES) {
      const entered = d.times[p];
      if (typeof entered !== 'number') continue;
      const a = after[p];
      cells.push({ iso: d.iso, prayer: p, entered, after: a, diff: a === null ? null : clockDiff(a, entered) });
    }
  }
  const offs = cells.map((c) => (c.diff === null ? MISSING_COST : Math.abs(c.diff)));
  const totalOff = offs.reduce((s, n) => s + n, 0);
  const maxOff = offs.length ? Math.max(...offs) : 0;
  const o = chosen.calc.offsets;
  const lateHint = [o.dhuhr, o.asr, o.maghrib].some((n) => n >= LATE_HINT_MIN);

  const calc: PrayerCalcSettings = { ...chosen.calc, offsets: { ...chosen.calc.offsets } };
  return { calc, cells, totalOff, maxOff, customAngles: usedCustom, confidence: confidenceLine(days, maxOff), lateHint };
}

function daysApart(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000));
}

/** One plain line on how much to trust the fit */
export function confidenceLine(days: MatchDay[], maxOff: number): string {
  if (maxOff > 2) {
    return 'Some times are still a few minutes out. Your mosque may set those by hand, so check them against its timetable.';
  }
  if (days.length < 2) {
    return 'This fits the date you entered. Times from a second date about a month away will confirm it.';
  }
  if (daysApart(days[0].iso, days[1].iso) < 20) {
    return 'This fits both dates, but they are close together. Two dates a month apart will confirm it.';
  }
  return 'This fits both dates, a few weeks apart, so it should follow the seasons the way your mosque does.';
}
