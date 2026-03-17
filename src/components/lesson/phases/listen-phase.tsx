'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Surah } from '@/types/quran';
import { useAudio } from '@/hooks/use-audio';
import { useProgressStore } from '@/stores/progress-store';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { audioController } from '@/lib/audio';

interface ListenPhaseProps {
  surah: Surah;
  onComplete: () => void;
}

const SPEEDS = [0.75, 1, 1.25];

export default function ListenPhase({ surah, onComplete }: ListenPhaseProps) {
  const { isPlaying, isPaused, setSpeed } = useAudio();
  const { incrementListenCount } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[surah.id]);
  const playCount = lesson?.phaseData.listen.playCount ?? 0;
  const [currentAyahIndex, setCurrentAyahIndex] = useState(-1);
  const [playingAll, setPlayingAll] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(1);
  const abortRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      audioController.stop();
    };
  }, []);

  const playAllAyahs = useCallback(async () => {
    if (playingAll) return; // Prevent duplicate
    abortRef.current = false;
    setPlayingAll(true);

    for (let i = 0; i < surah.ayahs.length; i++) {
      if (abortRef.current) break;
      setCurrentAyahIndex(i);
      await audioController.playAndWait(surah.ayahs[i].audioUrl);
      // Small gap between ayahs
      if (!abortRef.current) {
        await new Promise<void>((r) => setTimeout(r, 400));
      }
    }

    setCurrentAyahIndex(-1);
    setPlayingAll(false);
    if (!abortRef.current) {
      incrementListenCount(surah.id);
    }
  }, [surah, incrementListenCount, playingAll]);

  const stopPlayback = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
    setCurrentAyahIndex(-1);
  }, []);

  const playSingleAyah = useCallback(async (index: number) => {
    if (playingAll) return;
    setCurrentAyahIndex(index);
    await audioController.playAndWait(surah.ayahs[index].audioUrl);
    setCurrentAyahIndex(-1);
  }, [surah, playingAll]);

  const handleSpeedChange = (speed: number) => {
    setCurrentSpeed(speed);
    setSpeed(speed);
  };

  const canContinue = playCount >= 3;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Listen & Absorb</h3>
        <p className="mt-1 text-sm text-muted">
          Listen carefully to the recitation. Focus on the rhythm and pronunciation.
        </p>
      </div>

      {/* Ayah display — tap individual ayahs to play */}
      <div className="space-y-4">
        {surah.ayahs.map((ayah, i) => (
          <button
            key={ayah.key}
            onClick={() => playSingleAyah(i)}
            disabled={playingAll}
            className={cn(
              'w-full rounded-xl p-4 text-left transition-all',
              i === currentAyahIndex
                ? 'bg-teal/5 ring-2 ring-teal/30'
                : 'bg-card hover:bg-foreground/[0.02]',
              playingAll && i !== currentAyahIndex && 'opacity-50'
            )}
          >
            <AyahDisplay
              ayah={ayah}
              showTranslation={false}
            />
          </button>
        ))}
      </div>

      {/* Playback controls */}
      <div className="sticky bottom-16 space-y-3 rounded-2xl bg-card p-4 shadow-lg">
        {/* Status text */}
        <p className="text-center text-xs text-muted">
          {playingAll
            ? `Playing ayah ${currentAyahIndex + 1} of ${surah.ayahs.length}`
            : 'Tap an ayah or press play'}
        </p>

        {/* Media controls */}
        <div className="flex items-center justify-center gap-4">
          {/* Restart */}
          <button
            onClick={() => { stopPlayback(); playAllAyahs(); }}
            disabled={!playingAll}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground disabled:opacity-30"
            title="Restart"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>

          {/* Play / Pause / Resume */}
          <button
            onClick={() => {
              if (playingAll && isPlaying) {
                audioController.pause();
              } else if (playingAll && isPaused) {
                audioController.resume();
              } else {
                playAllAyahs();
              }
            }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-teal text-white shadow-lg transition-transform hover:scale-105"
          >
            {playingAll && isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <rect x="4" y="3" width="4" height="14" rx="1" />
                <rect x="12" y="3" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6 4l10 6-10 6V4z" />
              </svg>
            )}
          </button>

          {/* Stop */}
          <button
            onClick={stopPlayback}
            disabled={!playingAll}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground disabled:opacity-30"
            title="Stop"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <rect x="4" y="4" width="12" height="12" rx="2" />
            </svg>
          </button>
        </div>

        {/* Speed + Listen counter */}
        <div className="flex items-center justify-between">
          {/* Speed control */}
          <div className="flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={cn(
                  'rounded-lg px-2 py-1 text-xs font-semibold transition-colors',
                  currentSpeed === s ? 'bg-teal text-white' : 'text-muted hover:text-foreground'
                )}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Listen counter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">
              {playCount} / 3
            </span>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'h-2 w-2 rounded-full transition-colors',
                    i < playCount ? 'bg-success' : 'bg-foreground/10'
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <Button
        onClick={onComplete}
        disabled={!canContinue}
        className="w-full"
      >
        {canContinue ? 'Continue to Understand' : `Listen ${3 - playCount} more time${3 - playCount !== 1 ? 's' : ''}`}
      </Button>
    </div>
  );
}
