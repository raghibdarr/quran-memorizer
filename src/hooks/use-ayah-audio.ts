'use client';

import { useSettingsStore } from '@/stores/settings-store';
import { getAudioUrl } from '@/lib/quran-data';
import type { Ayah } from '@/types/quran';

/** Returns the audio URL for an ayah using the currently selected reciter */
export function useAyahAudioUrl(ayah: Ayah): string {
  const reciter = useSettingsStore((s) => s.reciter);
  // Parse surahId and ayahNumber from ayah.key (e.g. "1:2")
  const [surahId, ayahNumber] = ayah.key.split(':').map(Number);
  return getAudioUrl(surahId, ayahNumber, reciter);
}

/** Returns a function that gets audio URL for any ayah using the current reciter */
export function useReciterAudioUrl(): (surahId: number, ayahNumber: number) => string {
  const reciter = useSettingsStore((s) => s.reciter);
  return (surahId: number, ayahNumber: number) => getAudioUrl(surahId, ayahNumber, reciter);
}
