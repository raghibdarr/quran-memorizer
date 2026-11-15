'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PRAYER_NAMES, type PrayerName } from '@/types/prayer';

// The user's own prayer and fasting log (all-in-one spec 3.2). Device-only (a
// later opt-in sync is an owner decision); rides in the backup file. Calm by
// design: nothing here counts "missed" for display, and a pause needs no reason.

export const WORSHIP_STORE_KEY = 'takrar-worship';
export const WORSHIP_STORE_VERSION = 1;

export type PrayerMark = 'ontime' | 'late' | 'missed';
export type FastMark = 'fasted' | 'owed' | 'exempt';

export interface PrayerEntry { s: PrayerMark; at: number }
export interface FastEntry { s: FastMark; at: number }
export interface Pause { id: string; from: string; to?: string }

export interface WorshipData {
  /** Keyed by the place's local day (YYYY-MM-DD) */
  prayers: Record<string, Partial<Record<PrayerName, PrayerEntry>>>;
  fasts: Record<string, FastEntry>;
  /** Make-up prayers and fasts done (counts only) */
  madeUp: { prayers: number; fasts: number };
  /** Days inside a pause are left out of every count. `to` absent = still paused */
  pauses: Pause[];
  /** Lifetime tasbih per dhikr id (the live counters stay in quran-essentials) */
  tasbihTotals: Record<string, number>;
}

interface WorshipActions {
  markPrayer: (iso: string, prayer: PrayerName, s: PrayerMark, at?: number) => void;
  clearPrayer: (iso: string, prayer: PrayerName) => void;
  markFast: (iso: string, s: FastMark, at?: number) => void;
  clearFast: (iso: string) => void;
  /** Add (or with a negative n, take back) make-ups; never below zero */
  addMadeUp: (kind: 'prayers' | 'fasts', n?: number) => void;
  startPause: (fromIso: string) => string;
  endPause: (id: string, toIso: string) => void;
  removePause: (id: string) => void;
  addTasbih: (id: string, n?: number) => void;
}

export type WorshipState = WorshipData & WorshipActions;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PRAYER_MARKS: readonly PrayerMark[] = ['ontime', 'late', 'missed'];
const FAST_MARKS: readonly FastMark[] = ['fasted', 'owed', 'exempt'];

export function defaultWorshipData(): WorshipData {
  return { prayers: {}, fasts: {}, madeUp: { prayers: 0, fasts: 0 }, pauses: [], tasbihTotals: {} };
}

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const stamp = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/** Repairs any persisted or imported shape (idempotent) */
export function sanitizeWorshipData(raw: unknown): WorshipData {
  const s = (raw ?? {}) as Record<string, unknown>;
  const prayers: WorshipData['prayers'] = {};
  for (const [iso, day] of Object.entries((s.prayers ?? {}) as Record<string, Record<string, Partial<PrayerEntry>>>)) {
    if (!ISO.test(iso) || !day || typeof day !== 'object') continue;
    const clean: Partial<Record<PrayerName, PrayerEntry>> = {};
    for (const p of PRAYER_NAMES) {
      const e = day[p];
      if (e && PRAYER_MARKS.includes(e.s as PrayerMark)) clean[p] = { s: e.s as PrayerMark, at: stamp(e.at) };
    }
    if (Object.keys(clean).length) prayers[iso] = clean;
  }
  const fasts: WorshipData['fasts'] = {};
  for (const [iso, e] of Object.entries((s.fasts ?? {}) as Record<string, Partial<FastEntry>>)) {
    if (ISO.test(iso) && e && FAST_MARKS.includes(e.s as FastMark)) fasts[iso] = { s: e.s as FastMark, at: stamp(e.at) };
  }
  const madeUpIn = (s.madeUp ?? {}) as Record<string, unknown>;
  const pauses = (Array.isArray(s.pauses) ? s.pauses : [])
    .filter((p): p is Pause => !!p && typeof p.id === 'string' && typeof p.from === 'string' && ISO.test(p.from))
    .map((p) => (typeof p.to === 'string' && ISO.test(p.to) ? { id: p.id, from: p.from, to: p.to } : { id: p.id, from: p.from }));
  const tasbihTotals: Record<string, number> = {};
  for (const [id, n] of Object.entries((s.tasbihTotals ?? {}) as Record<string, unknown>)) {
    if (count(n) > 0) tasbihTotals[id] = count(n);
  }
  return { prayers, fasts, madeUp: { prayers: count(madeUpIn.prayers), fasts: count(madeUpIn.fasts) }, pauses, tasbihTotals };
}

export function migrateWorship(persisted: unknown, version: number): WorshipData {
  void version; // v1 is the first version
  return sanitizeWorshipData(persisted);
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const useWorshipStore = create<WorshipState>()(
  persist(
    (set) => ({
      ...defaultWorshipData(),
      markPrayer: (iso, prayer, s, at = Date.now()) =>
        set((st) => ({ prayers: { ...st.prayers, [iso]: { ...st.prayers[iso], [prayer]: { s, at } } } })),
      clearPrayer: (iso, prayer) =>
        set((st) => {
          const day = { ...st.prayers[iso] };
          delete day[prayer];
          const prayers = { ...st.prayers };
          if (Object.keys(day).length) prayers[iso] = day;
          else delete prayers[iso];
          return { prayers };
        }),
      markFast: (iso, s, at = Date.now()) => set((st) => ({ fasts: { ...st.fasts, [iso]: { s, at } } })),
      clearFast: (iso) =>
        set((st) => {
          const fasts = { ...st.fasts };
          delete fasts[iso];
          return { fasts };
        }),
      addMadeUp: (kind, n = 1) =>
        set((st) => ({ madeUp: { ...st.madeUp, [kind]: Math.max(0, st.madeUp[kind] + Math.round(n)) } })),
      startPause: (fromIso) => {
        const id = newId();
        set((st) => ({ pauses: [...st.pauses, { id, from: fromIso }] }));
        return id;
      },
      endPause: (id, toIso) => set((st) => ({ pauses: st.pauses.map((p) => (p.id === id ? { ...p, to: toIso } : p)) })),
      removePause: (id) => set((st) => ({ pauses: st.pauses.filter((p) => p.id !== id) })),
      addTasbih: (id, n = 1) =>
        set((st) => ({ tasbihTotals: { ...st.tasbihTotals, [id]: Math.max(0, (st.tasbihTotals[id] ?? 0) + Math.round(n)) } })),
    }),
    {
      name: WORSHIP_STORE_KEY,
      version: WORSHIP_STORE_VERSION,
      migrate: (p, v) => migrateWorship(p, v) as never,
      // Every rehydrate goes through the sanitizer, not only a version change: a
      // same-version value of the wrong shape (a newer build's id, a partial write)
      // must fall back to defaults rather than crash the screens that read it
      merge: (persisted, current) => ({ ...current, ...sanitizeWorshipData(persisted) }),
      partialize: ({ prayers, fasts, madeUp, pauses, tasbihTotals }) => ({ prayers, fasts, madeUp, pauses, tasbihTotals }),
    },
  ),
);
