'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Reading marks (roadmap #03): last read position, bookmarks, highlights and notes,
// keyed by ayah ("2:255"). Synced: every entry carries `at` and removals are kept as
// tombstones, so the merge (src/lib/sync/merge.ts mergeReader) is last-write-wins
// per ayah and a removal on one device can't be undone by another device's copy.

export const HIGHLIGHT_COLORS = ['gold', 'teal', 'rose', 'sky'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export interface Bookmark { at: number; deleted?: boolean }
export interface Highlight { at: number; color: HighlightColor; deleted?: boolean }
export interface Note { at: number; text: string; deleted?: boolean }
export interface LastRead { surah: number; ayah: number; at: number; /** How it was being read */ view?: 'ayah' | 'page' }

/** A khatm: read the whole mushaf in `days` days (roadmap #14). Pages read are kept by page number. */
export interface Khatm {
  id: string;
  startedAt: number;
  days: number;
  /** "ramadan" etc., for the label only */
  kind?: string;
  pagesRead: Record<string, number>;
  /** Set when finished or abandoned (kept so other devices learn it ended) */
  endedAt?: number;
}

export const ayahKey = (surah: number, ayah: number) => `${surah}:${ayah}`;
export function parseAyahKey(key: string): { surah: number; ayah: number } | null {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(key);
  return m ? { surah: Number(m[1]), ayah: Number(m[2]) } : null;
}

/** Live (not deleted) entries of a mark map */
export function live<T extends { deleted?: boolean }>(marks: Record<string, T>): [string, T][] {
  return Object.entries(marks).filter(([, m]) => !m.deleted);
}

export const NOTE_MAX = 2000;

interface ReaderState {
  lastRead: LastRead | null;
  bookmarks: Record<string, Bookmark>;
  highlights: Record<string, Highlight>;
  notes: Record<string, Note>;
  khatm: Khatm | null;
  startKhatm: (days: number, kind?: string) => void;
  endKhatm: () => void;
  markPagesRead: (pages: number[]) => void;
  setLastRead: (surah: number, ayah: number, view?: 'ayah' | 'page') => void;
  toggleBookmark: (key: string) => void;
  setHighlight: (key: string, color: HighlightColor | null) => void;
  setNote: (key: string, text: string) => void;
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      lastRead: null,
      bookmarks: {},
      highlights: {},
      notes: {},
      khatm: null,

      startKhatm: (days, kind) =>
        set({ khatm: { id: Math.random().toString(36).slice(2, 10), startedAt: Date.now(), days, kind, pagesRead: {} } }),
      endKhatm: () => set((s) => (s.khatm ? { khatm: { ...s.khatm, endedAt: Date.now() } } : s)),
      markPagesRead: (pages) =>
        set((s) => {
          if (!s.khatm || s.khatm.endedAt) return s;
          const fresh = pages.filter((p) => !s.khatm!.pagesRead[String(p)]);
          if (!fresh.length) return s;
          const pagesRead = { ...s.khatm.pagesRead };
          for (const p of fresh) pagesRead[String(p)] = Date.now();
          return { khatm: { ...s.khatm, pagesRead } };
        }),

      setLastRead: (surah, ayah, view = 'ayah') =>
        set((s) => (s.lastRead?.surah === surah && s.lastRead.ayah === ayah && (s.lastRead.view ?? 'ayah') === view ? s : { lastRead: { surah, ayah, at: Date.now(), view } })),

      toggleBookmark: (key) =>
        set((s) => {
          const on = s.bookmarks[key] && !s.bookmarks[key].deleted;
          return { bookmarks: { ...s.bookmarks, [key]: on ? { at: Date.now(), deleted: true } : { at: Date.now() } } };
        }),

      setHighlight: (key, color) =>
        set((s) => ({
          highlights: {
            ...s.highlights,
            [key]: color ? { at: Date.now(), color } : { at: Date.now(), color: s.highlights[key]?.color ?? 'gold', deleted: true },
          },
        })),

      setNote: (key, text) =>
        set((s) => {
          const trimmed = text.trim().slice(0, NOTE_MAX);
          const prev = s.notes[key];
          if (!trimmed && (!prev || prev.deleted)) return s;
          if (prev && !prev.deleted && prev.text === trimmed) return s;
          return { notes: { ...s.notes, [key]: trimmed ? { at: Date.now(), text: trimmed } : { at: Date.now(), text: '', deleted: true } } };
        }),
    }),
    // version + passthrough migrate: zustand DISCARDS persisted state on a version
    // mismatch without a migrate fn — every store must carry both (M2)
    { name: 'quran-reader', version: 1, migrate: (p) => p as never },
  ),
);
