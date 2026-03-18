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
const REQUIRED_LISTENS = 3;

export default function ListenPhase({ surah, onComplete }: ListenPhaseProps) {
  const { isPlaying, isPaused, setSpeed } = useAudio();
  const { incrementListenCount } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[surah.id]);
  const playCount = lesson?.phaseData.listen.playCount ?? 0;
  const [currentAyahIndex, setCurrentAyahIndex] = useState(-1);
  const [playingAll, setPlayingAll] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(1);
  const abortRef = useRef(false);
  const ayahRefs = useRef<(HTMLElement | null)[]>([]);

  const canContinue = playCount >= REQUIRED_LISTENS;
  const remaining = REQUIRED_LISTENS - playCount;

  useEffect(() => {
    return () => {
      abortRef.current = true;
      audioController.stop();
    };
  }, []);

  // Autoscroll to current ayah
  useEffect(() => {
    if (currentAyahIndex >= 0 && ayahRefs.current[currentAyahIndex]) {
      ayahRefs.current[currentAyahIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentAyahIndex]);

  const playAllAyahs = useCallback(async () => {
    if (playingAll) return;
    abortRef.current = false;
    setPlayingAll(true);

    for (let i = 0; i < surah.ayahs.length; i++) {
      if (abortRef.current) break;
      setCurrentAyahIndex(i);
      await audioController.playAndWait(surah.ayahs[i].audioUrl);
      if (!abortRef.current && i < surah.ayahs.length - 1) {
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

  // Individual ayah play — also counts toward progress
  const [individualPlays, setIndividualPlays] = useState(new Set<number>());

  const playSingleAyah = useCallback(async (index: number) => {
    if (playingAll) return;
    setCurrentAyahIndex(index);
    await audioController.playAndWait(surah.ayahs[index].audioUrl);
    setCurrentAyahIndex(-1);

    // Track individual plays — when all ayahs played, count as one full listen
    setIndividualPlays((prev) => {
      const next = new Set(prev);
      next.add(index);
      if (next.size >= surah.ayahs.length) {
        incrementListenCount(surah.id);
        return new Set();
      }
      return next;
    });
  }, [surah, playingAll, incrementListenCount]);

  const handleSpeedChange = (speed: number) => {
    setCurrentSpeed(speed);
    setSpeed(speed);
  };

  return (
    <div className="space-y-4">
      {/* Header with instruction + counter */}
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Listen & Absorb</h3>
        <p className="mt-1 text-sm text-muted">
          Listen to the full recitation {REQUIRED_LISTENS} times before continuing.
          {'\n'}Focus on the rhythm and pronunciation.
        </p>
      </div>

      {/* Prominent listen counter at top */}
      <div className="flex items-center justify-center gap-3 rounded-xl bg-card p-3 border border-foreground/10">
        <div className="flex gap-1.5">
          {Array.from({ length: REQUIRED_LISTENS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-3 w-3 rounded-full transition-all',
                i < playCount ? 'bg-success scale-110' : 'bg-foreground/10'
              )}
            />
          ))}
        </div>
        <span className="text-sm font-medium text-foreground">
          {canContinue
            ? 'Ready to continue!'
            : `${playCount} / ${REQUIRED_LISTENS} listens`}
        </span>
        {individualPlays.size > 0 && !canContinue && (
          <span className="text-xs text-muted">
            ({individualPlays.size}/{surah.ayahs.length} ayahs this round)
          </span>
        )}
      </div>

      {/* Continue button (shown at top when ready) */}
      {canContinue && (
        <Button onClick={onComplete} className="w-full">
          Continue to Understand
        </Button>
      )}

      {/* Ayah display */}
      <div className="space-y-3">
        {surah.ayahs.map((ayah, i) => (
          <button
            key={ayah.key}
            ref={(el) => { ayahRefs.current[i] = el; }}
            onClick={() => playSingleAyah(i)}
            disabled={playingAll}
            className={cn(
              'w-full rounded-xl p-4 text-left transition-all border',
              i === currentAyahIndex
                ? 'bg-teal/5 border-teal/30 shadow-md'
                : 'bg-card border-foreground/8 hover:border-foreground/15',
              playingAll && i !== currentAyahIndex && 'opacity-40'
            )}
          >
            <AyahDisplay ayah={ayah} />
          </button>
        ))}
      </div>

      {/* Media controls — sticky above bottom nav */}
      <div className="sticky bottom-16 rounded-2xl bg-card p-4 shadow-lg border border-foreground/10">
        {/* Status */}
        <p className="text-center text-xs text-muted mb-3">
          {playingAll
            ? `Playing ayah ${currentAyahIndex + 1} of ${surah.ayahs.length}`
            : 'Tap an ayah or press play for full surah'}
        </p>

        {/* Media buttons */}
        <div className="flex items-center justify-center gap-4">
          {/* Restart */}
          <button
            onClick={() => { stopPlayback(); setTimeout(playAllAyahs, 100); }}
            disabled={!playingAll}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground disabled:opacity-30"
            title="Restart"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>

          {/* Play / Pause */}
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

        {/* Speed */}
        <div className="mt-3 flex justify-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => handleSpeedChange(s)}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                currentSpeed === s ? 'bg-teal text-white' : 'text-muted hover:text-foreground'
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Bottom continue button */}
      <Button
        onClick={onComplete}
        disabled={!canContinue}
        className="w-full"
      >
        {canContinue ? 'Continue to Understand' : `Listen ${remaining} more time${remaining !== 1 ? 's' : ''}`}
      </Button>
    </div>
  );
}
