'use client';

import { useCallback, useEffect, useState } from 'react';
import { audioController } from '@/lib/audio';

export function useAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const unsubscribe = audioController.subscribe(() => {
      setIsPlaying(audioController.isPlaying);
      setCurrentTime(audioController.currentTime);
      setDuration(audioController.duration);
    });
    return unsubscribe;
  }, []);

  const play = useCallback(async (url: string) => {
    await audioController.play(url);
  }, []);

  const pause = useCallback(() => {
    audioController.pause();
  }, []);

  const resume = useCallback(() => {
    audioController.resume();
  }, []);

  const stop = useCallback(() => {
    audioController.stop();
  }, []);

  const setSpeed = useCallback((rate: number) => {
    audioController.setSpeed(rate);
  }, []);

  const playSequence = useCallback(async (urls: string[], gapMs?: number) => {
    await audioController.playSequence(urls, gapMs);
  }, []);

  return { play, pause, resume, stop, setSpeed, playSequence, isPlaying, currentTime, duration };
}
