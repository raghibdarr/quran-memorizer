'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Surah, Ayah } from '@/types/quran';
import { useAudio } from '@/hooks/use-audio';
import { useProgressStore } from '@/stores/progress-store';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { audioController } from '@/lib/audio';
import { getAudioUrl as buildAudioUrl } from '@/lib/quran-data';
import { useSettingsStore } from '@/stores/settings-store';

interface ListenPhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonId: string;
  onComplete: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
const REQUIRED_LISTENS = 3;

export default function ListenPhase({ surah, ayahs, lessonId, onComplete }: ListenPhaseProps) {
  const { isPlaying, isPaused, setSpeed } = useAudio();
  const { incrementListenCount } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[lessonId]);
  const playCount = lesson?.phaseData.listen.playCount ?? 0;
  const [currentAyahIndex, setCurrentAyahIndex] = useState(-1);
  const [playingAll, setPlayingAll] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(() => audioController.speed);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const abortRef = useRef(false);
  const ayahRefs = useRef<(HTMLElement | null)[]>([]);
  const counterRef = useRef<HTMLDivElement>(null);
  const [counterPinned, setCounterPinned] = useState(false);

  // Read reciter directly from store inside callbacks to avoid stale closures
  const getAudioUrl = (surahId: number, ayahNum: number) =>
    buildAudioUrl(surahId, ayahNum, useSettingsStore.getState().reciter);
  const canContinue = playCount >= REQUIRED_LISTENS;
  const remaining = REQUIRED_LISTENS - playCount;

  useEffect(() => {
    return () => { abortRef.current = true; audioController.stop(); };
  }, []);

  // Observe counter visibility for sticky behavior
  useEffect(() => {
    if (!counterRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCounterPinned(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );
    observer.observe(counterRef.current);
    return () => observer.disconnect();
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

    for (let i = 0; i < ayahs.length; i++) {
      if (abortRef.current) break;
      setCurrentAyahIndex(i);
      await audioController.playAndWait(getAudioUrl(surah.id, ayahs[i].number));
      if (!abortRef.current && i < ayahs.length - 1) {
        await new Promise<void>((r) => setTimeout(r, 400));
      }
    }

    setCurrentAyahIndex(-1);
    setPlayingAll(false);
    if (!abortRef.current) {
      incrementListenCount(lessonId);
    }
  }, [surah, incrementListenCount, playingAll]);

  const stopPlayback = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
    setCurrentAyahIndex(-1);
  }, []);

  const restartPlayback = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
    setCurrentAyahIndex(-1);
    // Small delay to let state settle before restarting
    setTimeout(() => { playAllAyahs(); }, 100);
  }, [playAllAyahs]);

  // Individual ayah play
  const [individualPlays, setIndividualPlays] = useState(new Set<number>());

  const playSingleAyah = useCallback(async (index: number) => {
    if (playingAll) return;
    setCurrentAyahIndex(index);
    await audioController.playAndWait(getAudioUrl(surah.id, ayahs[index].number));
    setCurrentAyahIndex(-1);

    setIndividualPlays((prev) => {
      const next = new Set(prev);
      next.add(index);
      if (next.size >= ayahs.length) {
        incrementListenCount(lessonId);
        return new Set();
      }
      return next;
    });
  }, [surah, ayahs, playingAll, incrementListenCount]);

  const handleSpeedChange = (speed: number) => {
    setCurrentSpeed(speed);
    setSpeed(speed);
    setShowSpeedMenu(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Listen & Absorb</h3>
        <p className="mt-1 text-sm text-muted">
          Listen to the full recitation {REQUIRED_LISTENS} times. Focus on rhythm and pronunciation.
        </p>
      </div>

      {/* Listen counter (observed for sticky) */}
      <div ref={counterRef}>
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
            {canContinue ? 'Ready to continue!' : `${playCount} / ${REQUIRED_LISTENS} listens`}
          </span>
        </div>
      </div>

      {/* Pinned counter (appears when original scrolls out) */}
      {counterPinned && (
        <div className="fixed left-0 right-0 z-20 px-4" style={{ top: 'var(--lesson-header-height, 140px)' }}>
          <div className="mx-auto max-w-2xl flex items-center justify-center gap-3 rounded-xl bg-card py-2 px-4 shadow-md border border-foreground/10">
            <div className="flex gap-1.5">
              {Array.from({ length: REQUIRED_LISTENS }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    i < playCount ? 'bg-success' : 'bg-foreground/10'
                  )}
                />
              ))}
            </div>
            <span className="text-xs font-medium text-foreground">
              {canContinue ? 'Ready!' : `${playCount} / ${REQUIRED_LISTENS} listens`}
            </span>
            {canContinue && (
              <button onClick={onComplete} className="ml-2 rounded-lg bg-teal px-3 py-1 text-xs font-semibold text-white">
                Continue
              </button>
            )}
          </div>
        </div>
      )}

      {canContinue && (
        <Button onClick={onComplete} className="w-full">
          Continue to Understand
        </Button>
      )}

      {/* Ayah cards */}
      <div className="space-y-3">
        {ayahs.map((ayah, i) => {
          const isActive = i === currentAyahIndex;
          return (
            <button
              key={ayah.key}
              ref={(el) => { ayahRefs.current[i] = el; }}
              onClick={() => playSingleAyah(i)}
              disabled={playingAll}
              className={cn(
                'w-full rounded-xl p-4 text-left transition-all border relative',
                isActive
                  ? 'bg-teal/5 border-teal/30 shadow-md'
                  : 'bg-card border-foreground/8 hover:border-foreground/15',
                playingAll && !isActive && 'opacity-40'
              )}
            >
              {/* Play indicator */}
              <div className={cn(
                'absolute top-3 left-3 flex items-center justify-center',
                isActive ? 'text-teal' : 'text-muted/40'
              )}>
                {isActive && isPlaying ? (
                  // Animated visualizer bars
                  <div className="flex items-end gap-[2px] h-4">
                    <div className="w-[3px] bg-teal rounded-full animate-[bar1_0.8s_ease-in-out_infinite]" />
                    <div className="w-[3px] bg-teal rounded-full animate-[bar2_0.8s_ease-in-out_infinite_0.2s]" />
                    <div className="w-[3px] bg-teal rounded-full animate-[bar3_0.8s_ease-in-out_infinite_0.4s]" />
                  </div>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 2l10 6-10 6V2z" />
                  </svg>
                )}
              </div>

              <AyahDisplay ayah={ayah} />
            </button>
          );
        })}
      </div>

      {/* Media controls */}
      <div className="sticky bottom-16 rounded-2xl bg-card p-3 shadow-lg border border-foreground/10">
        <div className="flex items-center gap-3">
          {/* Restart */}
          <button
            onClick={restartPlayback}
            disabled={!playingAll}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-30"
            title="Restart from beginning"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => {
              if (playingAll && isPlaying) audioController.pause();
              else if (playingAll && isPaused) audioController.resume();
              else playAllAyahs();
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-teal text-white shadow-lg transition-transform hover:scale-105"
          >
            {playingAll && isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="3.5" height="12" rx="1" />
                <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2l10 6-10 6V2z" />
              </svg>
            )}
          </button>

          {/* Stop */}
          <button
            onClick={stopPlayback}
            disabled={!playingAll}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-30"
            title="Stop"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="3" width="10" height="10" rx="1.5" />
            </svg>
          </button>

          {/* Spacer */}
          <div className="flex-1 text-center">
            <p className="text-xs text-muted">
              {playingAll
                ? `Ayah ${currentAyahIndex + 1} / ${ayahs.length}`
                : 'Tap ayah or play'}
            </p>
          </div>

          {/* Speed dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="rounded-lg bg-foreground/5 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-foreground/10"
            >
              {currentSpeed}x
            </button>
            {showSpeedMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSpeedMenu(false)} />
                <div className="absolute bottom-8 right-0 z-50 rounded-lg bg-card shadow-lg border border-foreground/10 py-1">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={cn(
                        'block w-full px-4 py-1.5 text-left text-xs font-medium',
                        s === currentSpeed ? 'text-teal bg-teal/5' : 'text-foreground hover:bg-foreground/5'
                      )}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom continue */}
      <Button onClick={onComplete} disabled={!canContinue} className="w-full">
        {canContinue ? 'Continue to Understand' : `Listen ${remaining} more time${remaining !== 1 ? 's' : ''}`}
      </Button>
    </div>
  );
}
