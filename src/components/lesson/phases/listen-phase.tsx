'use client';

import { useState, useCallback } from 'react';
import type { Surah } from '@/types/quran';
import { useAudio } from '@/hooks/use-audio';
import { useProgressStore } from '@/stores/progress-store';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';

interface ListenPhaseProps {
  surah: Surah;
  onComplete: () => void;
}

export default function ListenPhase({ surah, onComplete }: ListenPhaseProps) {
  const { play, pause, isPlaying } = useAudio();
  const { incrementListenCount } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[surah.id]);
  const playCount = lesson?.phaseData.listen.playCount ?? 0;
  const [currentAyahIndex, setCurrentAyahIndex] = useState(-1);

  const playAll = useCallback(async () => {
    for (let i = 0; i < surah.ayahs.length; i++) {
      setCurrentAyahIndex(i);
      const ayah = surah.ayahs[i];
      await new Promise<void>((resolve) => {
        const audio = new Audio(ayah.audioUrl);
        audio.onended = () => {
          setTimeout(resolve, 400);
        };
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    }
    setCurrentAyahIndex(-1);
    incrementListenCount(surah.id);
  }, [surah, incrementListenCount]);

  const canContinue = playCount >= 3;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Listen & Absorb</h3>
        <p className="mt-1 text-sm text-muted">
          Listen to the recitation carefully. Focus on the rhythm and sound.
        </p>
      </div>

      {/* Ayah display */}
      <div className="space-y-6">
        {surah.ayahs.map((ayah, i) => (
          <AyahDisplay
            key={ayah.key}
            ayah={ayah}
            highlightWords={
              i === currentAyahIndex
                ? ayah.words.filter((w) => w.charType === 'word').map((w) => w.position)
                : []
            }
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={playAll}
          disabled={isPlaying}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-teal text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-40"
        >
          {isPlaying ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="4" width="5" height="16" rx="1" />
              <rect x="14" y="4" width="5" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4l14 8-14 8V4z" />
            </svg>
          )}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted">
            Listened {playCount} / 3 times
          </span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full ${
                i < playCount ? 'bg-success' : 'bg-foreground/10'
              }`}
            />
          ))}
        </div>
      </div>

      <Button
        onClick={onComplete}
        disabled={!canContinue}
        className="w-full"
      >
        {canContinue ? 'Continue' : `Listen ${3 - playCount} more time${3 - playCount !== 1 ? 's' : ''}`}
      </Button>
    </div>
  );
}
