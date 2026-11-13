'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { reviewSm2, type Sm2Fields } from '@/lib/spaced-repetition';
import type { DeckDepth, School } from '@/types/deen';

// Learning state for hadith, adhkar, the Names and the course (all-in-one spec
// 3.2). The ONE new store that syncs (quran-deen): it holds no location and
// nothing about worship, only what was learned. Registered in all five sync
// places (merge.ts, rehydrate.ts, backup.ts, fixtures.test.ts, STORE_SCHEMA_VERSIONS).

export const DEEN_STORE_KEY = 'quran-deen';
export const DEEN_STORE_VERSION = 1;
export const DEFAULT_NEW_PER_DAY = 5;
/** Days of the `introduced` log kept (only today's count matters) */
const INTRODUCED_KEEP = 14;

/** One review card. Id format: `<deck>:<itemId>:<facet>` (nawawi40:01:recall) */
export type DeenCard = Sm2Fields & {
  deck: string;
  /** The item's `rev` when the card was made (a later rev can flag "changed since") */
  itemRev: number;
  addedAt: number;
  suspended?: boolean;
};

export interface DeenData {
  cards: Record<string, DeenCard>;
  /** Course lessons finished, with the first time they were */
  lessonsDone: Record<string, number>;
  depth: Record<string, DeckDepth>;
  /** The user's school, if they chose one: its position is listed first, never alone */
  school: School | null;
  newPerDay: number;
  /** New cards introduced per local day (YYYY-MM-DD), for the daily cap */
  introduced: Record<string, number>;
}

interface DeenActions {
  /** Adds cards that don't exist yet; existing cards are never overwritten */
  addCards: (cards: Record<string, DeenCard>) => void;
  /** Rates a card through the shared SM-2 core */
  reviewCard: (cardId: string, quality: number) => void;
  setSuspended: (cardId: string, suspended: boolean) => void;
  removeCards: (cardIds: string[]) => void;
  markLessonDone: (lessonId: string, at?: number) => void;
  setDepth: (deck: string, depth: DeckDepth) => void;
  setSchool: (school: School | null) => void;
  setNewPerDay: (n: number) => void;
  noteIntroduced: (iso: string, n?: number) => void;
}

export type DeenState = DeenData & DeenActions;

export const SCHOOLS: readonly School[] = ['hanafi', 'maliki', 'shafii', 'hanbali'];

export function defaultDeenData(): DeenData {
  return { cards: {}, lessonsDone: {}, depth: {}, school: null, newPerDay: DEFAULT_NEW_PER_DAY, introduced: {} };
}

const num = (n: unknown, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);

function sanitizeCard(raw: unknown): DeenCard | null {
  const c = raw as Partial<DeenCard> | null;
  if (!c || typeof c !== 'object' || typeof c.deck !== 'string') return null;
  const card: DeenCard = {
    deck: c.deck,
    itemRev: num(c.itemRev, 1),
    addedAt: num(c.addedAt, 0),
    easeFactor: num(c.easeFactor, 2.5),
    interval: num(c.interval, 0),
    repetitions: num(c.repetitions, 0),
    nextReview: num(c.nextReview, 0),
    lastReview: num(c.lastReview, 0),
    lastQuality: num(c.lastQuality, 0),
  };
  if (typeof c.failStreak === 'number') card.failStreak = c.failStreak;
  if (typeof c.lapses === 'number') card.lapses = c.lapses;
  if (Array.isArray(c.misses)) card.misses = c.misses.filter((m) => typeof m === 'number');
  if (c.suspended) card.suspended = true;
  return card;
}

/** Repairs any persisted or imported shape (idempotent) */
export function sanitizeDeenData(raw: unknown): DeenData {
  const s = (raw ?? {}) as Record<string, unknown>;
  const cards: Record<string, DeenCard> = {};
  for (const [id, c] of Object.entries((s.cards ?? {}) as Record<string, unknown>)) {
    const card = sanitizeCard(c);
    if (card) cards[id] = card;
  }
  const lessonsDone: Record<string, number> = {};
  for (const [id, ts] of Object.entries((s.lessonsDone ?? {}) as Record<string, unknown>)) {
    if (typeof ts === 'number' && Number.isFinite(ts)) lessonsDone[id] = ts;
  }
  const depth: Record<string, DeckDepth> = {};
  for (const [deck, d] of Object.entries((s.depth ?? {}) as Record<string, unknown>)) {
    if (d === 'meaning' || d === 'arabic') depth[deck] = d;
  }
  const introduced: Record<string, number> = {};
  for (const [iso, n] of Object.entries((s.introduced ?? {}) as Record<string, unknown>)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && typeof n === 'number' && n > 0) introduced[iso] = Math.floor(n);
  }
  const npd = num(s.newPerDay, DEFAULT_NEW_PER_DAY);
  return {
    cards,
    lessonsDone,
    depth,
    school: SCHOOLS.includes(s.school as School) ? (s.school as School) : null,
    newPerDay: Math.min(50, Math.max(0, Math.round(npd))),
    introduced,
  };
}

export function migrateDeen(persisted: unknown, version: number): DeenData {
  void version; // v1 is the first version
  return sanitizeDeenData(persisted);
}

export const useDeenStore = create<DeenState>()(
  persist(
    (set) => ({
      ...defaultDeenData(),
      addCards: (cards) =>
        set((s) => {
          const fresh = Object.entries(cards).filter(([id]) => !s.cards[id]);
          return fresh.length ? { cards: { ...s.cards, ...Object.fromEntries(fresh) } } : {};
        }),
      reviewCard: (cardId, quality) =>
        set((s) => (s.cards[cardId] ? { cards: { ...s.cards, [cardId]: reviewSm2(s.cards[cardId], quality) } } : {})),
      setSuspended: (cardId, suspended) =>
        set((s) => {
          const card = s.cards[cardId];
          if (!card) return {};
          const next = { ...card };
          if (suspended) next.suspended = true;
          else delete next.suspended;
          return { cards: { ...s.cards, [cardId]: next } };
        }),
      removeCards: (cardIds) =>
        set((s) => {
          const cards = { ...s.cards };
          for (const id of cardIds) delete cards[id];
          return { cards };
        }),
      markLessonDone: (lessonId, at = Date.now()) =>
        set((s) => (s.lessonsDone[lessonId] ? {} : { lessonsDone: { ...s.lessonsDone, [lessonId]: at } })),
      setDepth: (deck, depth) => set((s) => ({ depth: { ...s.depth, [deck]: depth } })),
      setSchool: (school) => set({ school: school && SCHOOLS.includes(school) ? school : null }),
      setNewPerDay: (n) => set({ newPerDay: Math.min(50, Math.max(0, Math.round(n))) }),
      noteIntroduced: (iso, n = 1) =>
        set((s) => {
          const introduced = { ...s.introduced, [iso]: (s.introduced[iso] ?? 0) + n };
          const keep = Object.keys(introduced).sort().slice(-INTRODUCED_KEEP);
          return { introduced: Object.fromEntries(keep.map((k) => [k, introduced[k]])) };
        }),
    }),
    {
      name: DEEN_STORE_KEY,
      version: DEEN_STORE_VERSION,
      migrate: (p, v) => migrateDeen(p, v) as never,
      partialize: ({ cards, lessonsDone, depth, school, newPerDay, introduced }) => ({ cards, lessonsDone, depth, school, newPerDay, introduced }),
    },
  ),
);
