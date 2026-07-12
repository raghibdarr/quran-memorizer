'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSettings, ArabicScriptStyle } from '@/types/quran';

interface SettingsState extends UserSettings {
  setReciter: (reciter: string) => void;
  setArabicScript: (style: ArabicScriptStyle) => void;
  setArabicFontSize: (size: number) => void;
  toggleTransliteration: () => void;
  toggleTranslation: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setDailyGoalActivities: (count: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      reciter: 'Alafasy_128kbps',
      // New-user defaults: plain Uthmani (unexplained multicolor tajweed intimidates
      // beginners — legend auto-opens once when they switch it on) and translation
      // visible (meaning-first). Existing users' persisted choices are untouched.
      arabicScript: 'uthmani',
      arabicFontSize: 1,
      transliterationEnabled: true,
      translationEnabled: true,
      playbackSpeed: 1,
      dailyGoalActivities: 2,

      setReciter: (reciter) => set({ reciter }),
      setArabicScript: (style) => set({ arabicScript: style }),
      setArabicFontSize: (size) => set({ arabicFontSize: size }),
      toggleTransliteration: () =>
        set((s) => ({ transliterationEnabled: !s.transliterationEnabled })),
      toggleTranslation: () =>
        set((s) => ({ translationEnabled: !s.translationEnabled })),
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      setDailyGoalActivities: (count) => set({ dailyGoalActivities: count }),
    }),
    {
      name: 'quran-settings',
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version === 0) {
          delete persisted.dailyGoalMinutes;
          persisted.dailyGoalActivities = 2;
        }
        if (version <= 1 && persisted.reciter === 'Maher_AlMuaiqly_64kbps') {
          // Maher moved to the 128kbps encode QUL's word timestamps align to
          persisted.reciter = 'MaherAlMuaiqly128kbps';
        }
        return persisted;
      },
    }
  )
);
