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
  setDailyGoal: (minutes: number) => void;
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
      dailyGoalMinutes: 10,

      setReciter: (reciter) => set({ reciter }),
      setArabicScript: (style) => set({ arabicScript: style }),
      setArabicFontSize: (size) => set({ arabicFontSize: size }),
      toggleTransliteration: () =>
        set((s) => ({ transliterationEnabled: !s.transliterationEnabled })),
      toggleTranslation: () =>
        set((s) => ({ translationEnabled: !s.translationEnabled })),
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      setDailyGoal: (minutes) => set({ dailyGoalMinutes: minutes }),
    }),
    { name: 'quran-settings' }
  )
);
