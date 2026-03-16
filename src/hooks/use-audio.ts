'use client';

import { useCallback, useEffect, useState } from 'react';
import { audioController } from '@/lib/audio';

export function useAudio() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const unsubscribe = audioController.subscribe(() => {
      forceUpdate((n) => n + 1);
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

  const togglePlayPause = useCallback((url: string) => {
    audioController.togglePlayPause(url);
  }, []);

  const setSpeed = useCallback((rate: number) => {
    audioController.setSpeed(rate);
  }, []);

  const playAndWait = useCallback(async (url: string) => {
    await audioController.playAndWait(url);
  }, []);

  const playSequence = useCallback(async (urls: string[], gapMs?: number) => {
    await audioController.playSequence(urls, gapMs);
  }, []);

  const playRepeated = useCallback(async (url: string, times: number, gapMs?: number) => {
    await audioController.playRepeated(url, times, gapMs);
  }, []);

  return {
    play,
    pause,
    resume,
    stop,
    togglePlayPause,
    setSpeed,
    playAndWait,
    playSequence,
    playRepeated,
    isPlaying: audioController.isPlaying,
    isPaused: audioController.isPaused,
    isLoading: audioController.isLoading,
    currentTime: audioController.currentTime,
    duration: audioController.duration,
    activeUrl: audioController.activeUrl,
  };
}
