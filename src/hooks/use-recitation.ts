'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAudio } from '@/hooks/use-audio';
import {
  getRecitationState,
  pauseRecitation,
  recitationAyahDurationMs,
  recitationClockMs,
  resumeRecitation,
  setRecitationRate,
  subscribeRecitation,
  type RecitationState,
} from '@/lib/recitation';
import { audioController } from '@/lib/audio';
import type { PlaybackTransport } from '@/components/ui/media-controls-bar';

/** The recitation session (src/lib/recitation.ts) as React state */
export function useRecitation(): RecitationState {
  return useSyncExternalStore(subscribeRecitation, getRecitationState, getRecitationState);
}

/**
 * The media bar's controls for a recitation session. On the web backend that's the
 * HTML audio controller itself; for the native player, the position ticks here.
 */
export function useRecitationTransport(): PlaybackTransport {
  const s = useRecitation();
  const web = useAudio();
  const [, tick] = useState(0);
  const native = s.backend === 'native';

  useEffect(() => {
    if (!native || !s.playing) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [native, s.playing]);

  // Web: the audio controller's clock and seeking, the session's play state (it
  // stays "playing" through the gaps between ayahs, and a pause holds the queue)
  if (!native) {
    return { ...web, isPlaying: s.active ? s.playing : web.isPlaying, isPaused: s.active ? !s.playing : web.isPaused, pause: pauseRecitation, resume: resumeRecitation };
  }
  return {
    isPlaying: s.playing,
    isPaused: s.active && !s.playing,
    currentTime: recitationClockMs() / 1000,
    duration: recitationAyahDurationMs() / 1000,
    pause: pauseRecitation,
    resume: resumeRecitation,
    // Scrubbing inside one ayah isn't offered for the native queue
    seek: () => {},
    setSpeed: (rate: number) => { setRecitationRate(rate); audioController.setSpeed(rate); },
  };
}
