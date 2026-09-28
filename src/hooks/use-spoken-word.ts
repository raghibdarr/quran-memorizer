'use client';

import { useEffect, useState } from 'react';
import { audioController } from '@/lib/audio';
import { loadSegmentTimings, wordAtTime, type SurahTimings } from '@/lib/segment-audio';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * The word being recited right now (0-based over real words), for highlighting
 * while audio plays. -1 when nothing is playing, before the first word, or for
 * reciters without word timings (see SEGMENT_AUDIO_RECITERS).
 *
 * `ayahNumber` must be the ayah whose recording is playing; `playing` whether
 * it is audibly playing (not paused, not in a gap between repetitions).
 */
export function useSpokenWord(surahId: number, ayahNumber: number | null, playing: boolean): number {
  const reciter = useSettingsStore((s) => s.reciter);
  const [loaded, setLoaded] = useState<{ key: string; timings: SurahTimings | null }>({ key: '', timings: null });
  const key = `${reciter}/${surahId}`;
  const timings = loaded.key === key ? loaded.timings : null;
  const [word, setWord] = useState(-1);

  useEffect(() => {
    let live = true;
    loadSegmentTimings(reciter, surahId).then((t) => live && setLoaded({ key: `${reciter}/${surahId}`, timings: t }));
    return () => { live = false; };
  }, [reciter, surahId]);

  useEffect(() => {
    if (!playing || ayahNumber == null || !timings) return;
    const ayahTimings = timings[String(ayahNumber)];
    let frame = 0;
    const tick = () => {
      const w = wordAtTime(ayahTimings, audioController.currentTime * 1000);
      setWord((prev) => (prev === w ? prev : w));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, ayahNumber, timings]);

  return playing && ayahNumber != null && timings ? word : -1;
}
