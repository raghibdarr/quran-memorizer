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
      arabicScript: 'tajweed',
      arabicFontSize: 1,
      transliterationEnabled: true,
      translationEnabled: false,
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
      version: 1,
      migrate: (persisted: any, version: number) => {
        if (version === 0) {
          delete persisted.dailyGoalMinutes;
          persisted.dailyGoalActivities = 2;
        }
        return persisted;
      },
    }
  )
);
