'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  PRAYER_NAMES,
  TIME_NAMES,
  type AlertMode,
  type AsrMadhab,
  type CustomAngles,
  type HighLatRule,
  type MethodId,
  type PrayerAlert,
  type PrayerCalcSettings,
  type PrayerName,
  type PrayerOffsets,
  type RamadanMode,
  type TimeName,
} from '@/types/prayer';
import { isMethodId } from '@/lib/prayer/methods';

// Prayer-time settings (all-in-one spec 3.2). Device-only: a method choice hints
// at a region, so this never syncs. It does ride in the backup file (it holds no
// coordinates; the place lives in takrar-place, which the backup leaves out).

export const PRAYER_STORE_KEY = 'takrar-prayer';
export const PRAYER_STORE_VERSION = 1;

export const HIGH_LAT_RULES: readonly HighLatRule[] = ['auto', 'middleofthenight', 'seventhofthenight', 'twilightangle'];
export const ALERT_MODES: readonly AlertMode[] = ['off', 'silent', 'default', 'chime'];
/** Offsets are clamped to this many minutes either way */
export const MAX_OFFSET_MIN = 60;

/** The calculation fields Match my mosque changes, kept for Undo */
export type CalcSnapshot = PrayerCalcSettings;

export interface PrayerData {
  method: MethodId;
  madhab: AsrMadhab;
  highLatRule: HighLatRule;
  offsets: PrayerOffsets;
  customAngles?: CustomAngles;
  /** Days added to the computed Hijri date, -2..2 (local moon sighting) */
  hijriOffset: number;
  alerts: Record<PrayerName, PrayerAlert>;
  /** Show the one-line next-prayer strip on Home */
  homeStrip: boolean;
  ramadanMode: RamadanMode;
  /** Minutes before Fajr that suhoor is shown to end */
  imsakMin: number;
  setupDone: boolean;
  /** The calculation before the last applyCalc, for Undo */
  previous?: CalcSnapshot;
}

interface PrayerActions {
  setMethod: (method: MethodId) => void;
  setMadhab: (madhab: AsrMadhab) => void;
  setHighLatRule: (rule: HighLatRule) => void;
  setOffset: (name: TimeName, minutes: number) => void;
  setCustomAngles: (angles: CustomAngles | undefined) => void;
  setHijriOffset: (days: number) => void;
  setAlert: (prayer: PrayerName, alert: Partial<PrayerAlert>) => void;
  setAllAlerts: (mode: AlertMode) => void;
  setHomeStrip: (on: boolean) => void;
  setRamadanMode: (mode: RamadanMode) => void;
  setImsakMin: (minutes: number) => void;
  completeSetup: () => void;
  /** Replace the whole calculation at once (Match my mosque), remembering the old one */
  applyCalc: (calc: CalcSnapshot) => void;
  /** Put back the calculation from before the last applyCalc */
  undoCalc: () => void;
}

export type PrayerState = PrayerData & PrayerActions;

const zeroOffsets = (): PrayerOffsets => ({ fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 });
const offAlerts = (): Record<PrayerName, PrayerAlert> =>
  Object.fromEntries(PRAYER_NAMES.map((p) => [p, { mode: 'off', preAlertMin: 0 }])) as Record<PrayerName, PrayerAlert>;

export function defaultPrayerData(): PrayerData {
  return {
    method: 'MuslimWorldLeague',
    madhab: 'standard',
    highLatRule: 'auto',
    offsets: zeroOffsets(),
    hijriOffset: 0,
    alerts: offAlerts(),
    homeStrip: true,
    ramadanMode: 'auto',
    imsakMin: 10,
    setupDone: false,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const clampInt = (n: unknown, lo: number, hi: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : fallback;

function sanitizeOffsets(raw: unknown): PrayerOffsets {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out = zeroOffsets();
  for (const t of TIME_NAMES) out[t] = clampInt(o[t], -MAX_OFFSET_MIN, MAX_OFFSET_MIN, 0);
  return out;
}

function sanitizeAngles(raw: unknown): CustomAngles | undefined {
  const a = raw as Partial<CustomAngles> | null | undefined;
  if (!a || typeof a !== 'object') return undefined;
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 30;
  if (!ok(a.fajr) || !ok(a.isha)) return undefined;
  const interval = typeof a.ishaInterval === 'number' && a.ishaInterval > 0 && a.ishaInterval <= 180 ? Math.round(a.ishaInterval) : undefined;
  return { fajr: a.fajr!, isha: a.isha!, ...(interval ? { ishaInterval: interval } : {}) };
}

function sanitizeCalc(raw: unknown): CalcSnapshot | undefined {
  const c = raw as Partial<CalcSnapshot> | null | undefined;
  if (!c || typeof c !== 'object' || !isMethodId(c.method)) return undefined;
  const customAngles = sanitizeAngles(c.customAngles);
  return {
    method: c.method,
    madhab: c.madhab === 'hanafi' ? 'hanafi' : 'standard',
    highLatRule: HIGH_LAT_RULES.includes(c.highLatRule as HighLatRule) ? (c.highLatRule as HighLatRule) : 'auto',
    offsets: sanitizeOffsets(c.offsets),
    ...(customAngles ? { customAngles } : {}),
  };
}

/** Repairs any persisted or imported shape into valid prayer data (idempotent) */
export function sanitizePrayerData(raw: unknown): PrayerData {
  const d = defaultPrayerData();
  const s = (raw ?? {}) as Record<string, unknown>;
  const alertsIn = (s.alerts ?? {}) as Record<string, Partial<PrayerAlert>>;
  const alerts = offAlerts();
  for (const p of PRAYER_NAMES) {
    const a = alertsIn[p];
    if (!a || typeof a !== 'object') continue;
    alerts[p] = {
      // Unknown modes (a later build's 'adhan') fall back to the system sound, not silence
      mode: typeof a.mode === 'string' ? (ALERT_MODES.includes(a.mode as AlertMode) ? (a.mode as AlertMode) : 'default') : 'off',
      preAlertMin: clampInt(a.preAlertMin, 0, 60, 0),
    };
  }
  const customAngles = sanitizeAngles(s.customAngles);
  const previous = sanitizeCalc(s.previous);
  return {
    method: isMethodId(s.method) ? s.method : d.method,
    madhab: s.madhab === 'hanafi' ? 'hanafi' : 'standard',
    highLatRule: HIGH_LAT_RULES.includes(s.highLatRule as HighLatRule) ? (s.highLatRule as HighLatRule) : 'auto',
    offsets: sanitizeOffsets(s.offsets),
    ...(customAngles ? { customAngles } : {}),
    hijriOffset: clampInt(s.hijriOffset, -2, 2, 0),
    alerts,
    homeStrip: typeof s.homeStrip === 'boolean' ? s.homeStrip : d.homeStrip,
    ramadanMode: s.ramadanMode === 'on' || s.ramadanMode === 'off' ? s.ramadanMode : 'auto',
    imsakMin: clampInt(s.imsakMin, 0, 60, d.imsakMin),
    setupDone: s.setupDone === true,
    ...(previous ? { previous } : {}),
  };
}

export function migratePrayer(persisted: unknown, version: number): PrayerData {
  void version; // v1 is the first version
  return sanitizePrayerData(persisted);
}

/** The engine's view of the store */
export function calcSettingsOf(s: PrayerData): PrayerCalcSettings {
  return {
    method: s.method,
    madhab: s.madhab,
    highLatRule: s.highLatRule,
    offsets: s.offsets,
    ...(s.customAngles ? { customAngles: s.customAngles } : {}),
  };
}

export const usePrayerStore = create<PrayerState>()(
  persist(
    (set) => ({
      ...defaultPrayerData(),
      setMethod: (method) => set(isMethodId(method) ? { method } : {}),
      setMadhab: (madhab) => set({ madhab: madhab === 'hanafi' ? 'hanafi' : 'standard' }),
      setHighLatRule: (rule) => set(HIGH_LAT_RULES.includes(rule) ? { highLatRule: rule } : {}),
      setOffset: (name, minutes) =>
        set((s) => ({ offsets: { ...s.offsets, [name]: clampInt(minutes, -MAX_OFFSET_MIN, MAX_OFFSET_MIN, 0) } })),
      setCustomAngles: (angles) => set({ customAngles: sanitizeAngles(angles) }),
      setHijriOffset: (days) => set({ hijriOffset: clampInt(days, -2, 2, 0) }),
      setAlert: (prayer, alert) =>
        set((s) => ({
          alerts: {
            ...s.alerts,
            [prayer]: {
              mode: alert.mode && ALERT_MODES.includes(alert.mode) ? alert.mode : s.alerts[prayer].mode,
              preAlertMin: alert.preAlertMin === undefined ? s.alerts[prayer].preAlertMin : clampInt(alert.preAlertMin, 0, 60, 0),
            },
          },
        })),
      setAllAlerts: (mode) =>
        set((s) => ({
          alerts: Object.fromEntries(PRAYER_NAMES.map((p) => [p, { ...s.alerts[p], mode }])) as Record<PrayerName, PrayerAlert>,
        })),
      setHomeStrip: (on) => set({ homeStrip: on }),
      setRamadanMode: (mode) => set({ ramadanMode: mode }),
      setImsakMin: (minutes) => set({ imsakMin: clampInt(minutes, 0, 60, 10) }),
      completeSetup: () => set({ setupDone: true }),
      applyCalc: (calc) =>
        set((s) => {
          const next = sanitizeCalc(calc);
          if (!next) return {};
          return { ...next, customAngles: next.customAngles, previous: calcSettingsOf(s) };
        }),
      undoCalc: () =>
        set((s) => (s.previous ? { ...s.previous, customAngles: s.previous.customAngles, previous: undefined } : {})),
    }),
    {
      name: PRAYER_STORE_KEY,
      version: PRAYER_STORE_VERSION,
      migrate: (p, v) => migratePrayer(p, v) as never,
      partialize: ({ method, madhab, highLatRule, offsets, customAngles, hijriOffset, alerts, homeStrip, ramadanMode, imsakMin, setupDone, previous }) =>
        ({ method, madhab, highLatRule, offsets, customAngles, hijriOffset, alerts, homeStrip, ramadanMode, imsakMin, setupDone, previous }),
    },
  ),
);
