'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSettings } from '@/types/quran';

interface SettingsState extends UserSettings {
  setReciter: (reciter: string) => void;
  toggleTransliteration: () => void;
  toggleTranslation: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setDailyGoal: (minutes: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      reciter: 'Alafasy_128kbps',
      transliterationEnabled: true,
      translationEnabled: false,
      playbackSpeed: 1,
      dailyGoalMinutes: 10,

      setReciter: (reciter) => set({ reciter }),
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
