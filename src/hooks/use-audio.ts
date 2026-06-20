'use client';

import { useCallback, useEffect, useState } from 'react';
import { audioController } from '@/lib/audio';
import { useSettingsStore } from '@/stores/settings-store';

export function useAudio() {
  const [, forceUpdate] = useState(0);
  const reciter = useSettingsStore((s) => s.reciter);

  useEffect(() => {
    const unsubscribe = audioController.subscribe(() => {
      forceUpdate((n) => n + 1);
    });
    return unsubscribe;
  }, []);

  // Keep the controller's reciter in sync with settings
  useEffect(() => {
    audioController.setReciter(reciter);
  }, [reciter]);

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

  const seek = useCallback((time: number) => {
    audioController.seek(time);
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
    seek,
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
