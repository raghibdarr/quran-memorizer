// Prayer alert planner (all-in-one spec 3.6, 6). Pure: given the place, the
// prayer settings and "now", it lists every alert to hand to the OS, in time
// order. src/lib/prayer/notifications.ts turns the list into local
// notifications; src/components/prayer-sync.tsx replans on every open.
//
// IDs: 20000 + dayIndex * 20 + slot. dayIndex is the place's calendar day
// counted from 1970-01-01, modulo 50, so the same (day, slot) keeps the same id
// from one replan to the next however many days pass. 50 days of ids cover the
// widest window planned (yesterday, for an Isha that runs past midnight, plus
// at most 48 days ahead), so two planned days never share an id.
//
// Budget: Android plans 30 days. iOS keeps at most 48 prayer alerts pending
// (registry.ts), so it plans as many whole days as fit, pre-alerts included.
// The last alert carries a quiet tail (id 21000) at the same instant: "Open
// Takrar to keep prayer alerts coming".
//
// Load this module by dynamic import from anything Home renders: it pulls in
// the engine, and with it adhan.

import { addDaysIso } from '@/lib/dates';
import {
  ANDROID_PRAYER_HORIZON_DAYS,
  NOTIFY_RANGES,
  PRAYER_MAX_DAYS,
  PRAYER_TAIL_ID,
  budgetFor,
  prayerAlertId,
} from '@/lib/notify/registry';
import {
  PRAYER_NAMES,
  TIME_LABELS,
  type AlertMode,
  type Place,
  type PrayerAlert,
  type PrayerCalcSettings,
  type PrayerName,
} from '@/types/prayer';
import { computeDay, formatTime, isoInTz } from './engine';

export type AlertPlatform = 'ios' | 'android' | 'web';
/** A mode that makes a notification */
export type AudibleMode = Exclude<AlertMode, 'off'>;

/** What the planner reads from the prayer store */
export interface AlertSettings extends PrayerCalcSettings {
  alerts: Record<PrayerName, PrayerAlert>;
}

export interface PlanInput {
  now: number;
  place: Pick<Place, 'lat' | 'lng' | 'tz'>;
  settings: AlertSettings;
  platform: AlertPlatform;
  /** Show times as "3:12 PM" instead of "15:12" */
  hour12?: boolean;
}

export interface PlannedAlert {
  id: number;
  /** Epoch ms */
  at: number;
  prayer: PrayerName;
  /** The prayer's own start, or a heads-up before it */
  kind: 'start' | 'pre';
  /** The place's calendar day the prayer belongs to (an Isha after midnight belongs to the day before) */
  iso: string;
  /** How it sounds ('chime' never appears on iOS) */
  mode: AudibleMode;
  title: string;
  body: string;
  url: string;
}

export interface PlannedTail {
  id: number;
  at: number;
  title: string;
  body: string;
  url: string;
}

export interface AlertPlan {
  /** In time order (ties by id) */
  alerts: PlannedAlert[];
  /** At the last alert's instant; null when nothing is planned */
  tail: PlannedTail | null;
  /** The place's calendar days that have at least one alert */
  days: number;
}

export const ALERT_URL = '/prayer';
/** The prayer's start uses slots 0-4, its heads-up 5-9; 10-18 are spare and
 *  19 is the health check's test alert (notifications.ts), never planned */
export const START_SLOT: Record<PrayerName, number> = { fajr: 0, dhuhr: 1, asr: 2, maghrib: 3, isha: 4 };
export const PRE_SLOT_OFFSET = 5;
/** iOS days are capped below the id window (50 days, one of them yesterday) */
export const IOS_MAX_DAYS = PRAYER_MAX_DAYS - 2;

export const TAIL_TITLE = 'Prayer alerts';
export const TAIL_BODY = 'Open Takrar to keep prayer alerts coming';

const MIN = 60_000;
const DAY_MS = 86_400_000;

/** The id-window day (0..49) of a calendar day */
export function dayIndexOf(iso: string): number {
  const epochDay = Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
  return ((epochDay % PRAYER_MAX_DAYS) + PRAYER_MAX_DAYS) % PRAYER_MAX_DAYS;
}

/** "10 min", "1 h", "1 h 15 min" */
export function leadText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** The mode a platform can actually play: iOS has no chime, it uses the system sound */
export function modeFor(mode: AlertMode, platform: AlertPlatform): AlertMode {
  if (mode === 'chime' && platform !== 'android') return 'default';
  return mode;
}

/** The modes to offer on a platform */
export function modesFor(platform: AlertPlatform): AlertMode[] {
  return platform === 'android' ? ['off', 'silent', 'default', 'chime'] : ['off', 'silent', 'default'];
}

/** Alerts one day holds: its prayers and heads-ups still ahead of `now` */
function dayAlerts(input: PlanInput, iso: string): PlannedAlert[] {
  const { now, place, settings, platform } = input;
  const times = computeDay(place, iso, settings);
  const index = dayIndexOf(iso);
  const out: PlannedAlert[] = [];
  for (const prayer of PRAYER_NAMES) {
    const alert = settings.alerts[prayer];
    const at = times[prayer];
    if (!alert || alert.mode === 'off' || at === null) continue;
    const mode = modeFor(alert.mode, platform) as AudibleMode;
    const label = TIME_LABELS[prayer];
    const time = formatTime(at, place.tz, { hour12: input.hour12 });
    const pre = Math.round(alert.preAlertMin);
    if (pre > 0 && at - pre * MIN > now) {
      out.push({
        id: prayerAlertId(index, START_SLOT[prayer] + PRE_SLOT_OFFSET),
        at: at - pre * MIN,
        prayer,
        kind: 'pre',
        iso,
        mode,
        title: 'Next prayer',
        body: `${label} in ${leadText(pre)} · ${time}`,
        url: ALERT_URL,
      });
    }
    if (at > now) {
      out.push({
        id: prayerAlertId(index, START_SLOT[prayer]),
        at,
        prayer,
        kind: 'start',
        iso,
        mode,
        title: 'Prayer time',
        body: `${label} · ${time}`,
        url: ALERT_URL,
      });
    }
  }
  return out;
}

const byTime = (a: { at: number; id: number }, b: { at: number; id: number }) => a.at - b.at || a.id - b.id;

/** Every alert to schedule, in time order, within the platform's budget */
export function planPrayerAlerts(input: PlanInput): AlertPlan {
  const empty: AlertPlan = { alerts: [], tail: null, days: 0 };
  if (input.platform === 'web') return empty;
  if (!PRAYER_NAMES.some((p) => input.settings.alerts[p]?.mode && input.settings.alerts[p].mode !== 'off')) return empty;

  const today = isoInTz(input.now, input.place.tz);
  const ios = input.platform === 'ios';
  const lastDay = ios ? IOS_MAX_DAYS : ANDROID_PRAYER_HORIZON_DAYS - 1;
  const budget = budgetFor(NOTIFY_RANGES.prayer, input.platform);

  const alerts: PlannedAlert[] = [];
  let days = 0;
  // From yesterday: its Isha can run past midnight into today
  for (let d = -1; d <= lastDay; d++) {
    const day = dayAlerts(input, addDaysIso(today, d));
    if (!day.length) continue;
    // Whole days only: a day that doesn't fit ends the plan
    if (alerts.length + day.length > budget) break;
    alerts.push(...day);
    days++;
  }
  alerts.sort(byTime);

  const last = alerts[alerts.length - 1];
  const tail: PlannedTail | null = last
    ? { id: PRAYER_TAIL_ID, at: last.at, title: TAIL_TITLE, body: TAIL_BODY, url: ALERT_URL }
    : null;
  return { alerts, tail, days };
}

/** How many alerts a day holds with these settings (for the screen's summary) */
export function alertsPerDay(alerts: Record<PrayerName, PrayerAlert>): number {
  return PRAYER_NAMES.reduce((n, p) => {
    const a = alerts[p];
    if (!a || a.mode === 'off') return n;
    return n + 1 + (a.preAlertMin > 0 ? 1 : 0);
  }, 0);
}
