'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSettings, ArabicScriptStyle } from '@/types/quran';
import { RENAMED_RECITERS } from '@/lib/reciters';

interface SettingsState extends UserSettings {
  setReciter: (reciter: string) => void;
  setArabicScript: (style: ArabicScriptStyle) => void;
  setArabicFontSize: (size: number) => void;
  toggleTransliteration: () => void;
  toggleTranslation: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setListenRepeat: (times: number, pauseMs: number, pauseFactor?: number) => void;
  setListenRangeRepeat: (times: number) => void;
  setListenUntil: (until: NonNullable<UserSettings['listenUntil']>) => void;
  toggleReaderWordByWord: () => void;
  toggleHideStats: () => void;
  toggleMushafMarkSimilar: () => void;
  toggleMushafMemoryInk: () => void;
  setMushafLayout: (layout: 'madina' | 'indopak') => void;
  setTranslationId: (id: 'saheeh' | 'clear') => void;
  setDailyGoalActivities: (count: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      reciter: 'Alafasy_128kbps',
      // New-user defaults (owner call 2026-07-12): tajweed stays the default script —
      // the legend now auto-expands the first time it's seen, which answers the
      // "unexplained colors" audit finding without hiding tajweed. Translation
      // visible (meaning-first). Existing users' persisted choices are untouched.
      arabicScript: 'tajweed',
      arabicFontSize: 1,
      transliterationEnabled: true,
      translationEnabled: true,
      playbackSpeed: 1,
      listenRepeat: 1,
      listenPauseMs: 0,
      listenUntil: 'surah',
      dailyGoalActivities: 2,

      setReciter: (reciter) => set({ reciter }),
      setArabicScript: (style) => set({ arabicScript: style }),
      setArabicFontSize: (size) => set({ arabicFontSize: size }),
      toggleTransliteration: () =>
        set((s) => ({ transliterationEnabled: !s.transliterationEnabled })),
      toggleTranslation: () =>
        set((s) => ({ translationEnabled: !s.translationEnabled })),
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      setListenRepeat: (times, pauseMs, pauseFactor = 0) => set({ listenRepeat: times, listenPauseMs: pauseMs, listenPauseFactor: pauseFactor }),
      setListenRangeRepeat: (listenRangeRepeat) => set({ listenRangeRepeat }),
      setListenUntil: (listenUntil) => set({ listenUntil }),
      toggleReaderWordByWord: () => set((s) => ({ readerWordByWord: !s.readerWordByWord })),
      toggleHideStats: () => set((s) => ({ hideStats: !s.hideStats })),
      toggleMushafMarkSimilar: () => set((s) => ({ mushafMarkSimilar: !s.mushafMarkSimilar })),
      toggleMushafMemoryInk: () => set((s) => ({ mushafMemoryInk: !s.mushafMemoryInk })),
      setMushafLayout: (mushafLayout) => set({ mushafLayout }),
      setTranslationId: (translationId) => set({ translationId }),
      setDailyGoalActivities: (count) => set({ dailyGoalActivities: count }),
    }),
    {
      name: 'quran-settings',
      version: 3,
      migrate: (persisted: any, version: number) => {
        if (version === 0) {
          delete persisted.dailyGoalMinutes;
          persisted.dailyGoalActivities = 2;
        }
        if (version <= 1 && persisted.reciter === 'Maher_AlMuaiqly_64kbps') {
          // Maher moved to the 128kbps encode QUL's word timestamps align to
          persisted.reciter = 'MaherAlMuaiqly128kbps';
        }
        if (version <= 2 && RENAMED_RECITERS[persisted.reciter]) {
          // Off Tarteel's CDN: the same reciters now play from EveryAyah
          persisted.reciter = RENAMED_RECITERS[persisted.reciter];
        }
        return persisted;
      },
    }
  )
);
