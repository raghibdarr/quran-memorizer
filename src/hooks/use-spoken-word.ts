'use client';

import { useEffect, useRef, useState } from 'react';
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
export function useSpokenWord(
  surahId: number,
  ayahNumber: number | null,
  playing: boolean,
  /** ms into the ayah's recording; defaults to the HTML audio controller's clock */
  clockMs: () => number = () => audioController.currentTime * 1000,
): number {
  const reciter = useSettingsStore((s) => s.reciter);
  const [loaded, setLoaded] = useState<{ key: string; timings: SurahTimings | null }>({ key: '', timings: null });
  const key = `${reciter}/${surahId}`;
  const timings = loaded.key === key ? loaded.timings : null;
  // keyed by ayah, so a new ayah never flashes the last word of the one before
  const [word, setWord] = useState<{ ayah: number | null; w: number }>({ ayah: null, w: -1 });

  useEffect(() => {
    let live = true;
    loadSegmentTimings(reciter, surahId).then((t) => live && setLoaded({ key: `${reciter}/${surahId}`, timings: t }));
    return () => { live = false; };
  }, [reciter, surahId]);

  // The clock can be a fresh closure each render; read the latest without re-subscribing
  const clockRef = useRef(clockMs);
  useEffect(() => { clockRef.current = clockMs; });

  useEffect(() => {
    if (!playing || ayahNumber == null || !timings) return;
    const ayahTimings = timings[String(ayahNumber)];
    let frame = 0;
    const tick = () => {
      const w = wordAtTime(ayahTimings, clockRef.current());
      setWord((prev) => (prev.ayah === ayahNumber && prev.w === w ? prev : { ayah: ayahNumber, w }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, ayahNumber, timings]);

  return playing && ayahNumber != null && timings && word.ayah === ayahNumber ? word.w : -1;
}
