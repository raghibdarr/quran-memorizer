'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PracticeSession } from '@/types/quran';

interface PracticeState {
  sessions: PracticeSession[];
  addSession: (session: PracticeSession) => void;
  getSessionsForSurah: (surahId: number) => PracticeSession[];
}

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set, get) => ({
      sessions: [],

      addSession: (session) =>
        set((state) => ({
          sessions: [...state.sessions, session],
        })),

      getSessionsForSurah: (surahId) =>
        get().sessions.filter((s) => s.surahIds.includes(surahId)),
    }),
    { name: 'quran-practice' }
  )
);
