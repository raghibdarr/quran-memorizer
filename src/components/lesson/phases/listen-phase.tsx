'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Surah, Ayah } from '@/types/quran';
import { useAudio } from '@/hooks/use-audio';
import { useProgressStore } from '@/stores/progress-store';
import AyahDisplay from '@/components/ui/ayah-display';
import BeadProgress from '@/components/ui/bead-progress';
import Button from '@/components/ui/button';
import MediaControlsBar from '@/components/ui/media-controls-bar';
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

const REQUIRED_LISTENS = 3;

export default function ListenPhase({ surah, ayahs, lessonId, onComplete }: ListenPhaseProps) {
  const { isPlaying } = useAudio();
  const { incrementListenCount } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[lessonId]);
  const playCount = lesson?.phaseData.listen.playCount ?? 0;
  const [currentAyahIndex, setCurrentAyahIndex] = useState(-1);
  const [playingAll, setPlayingAll] = useState(false);
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
        <div className="flex items-center justify-center gap-3 rounded-xl border border-foreground/10 bg-card p-3">
          <BeadProgress total={REQUIRED_LISTENS} filled={playCount} showCurrent />
          <span className="text-sm font-medium text-foreground">
            {canContinue ? 'Ready to continue!' : `${playCount} / ${REQUIRED_LISTENS} listens`}
          </span>
        </div>
      </div>

      {/* Pinned counter (appears when original scrolls out) */}
      {counterPinned && (
        <div className="fixed left-0 right-0 z-20 px-4" style={{ top: 'var(--lesson-header-height, 140px)' }}>
          <div className="tactile-card mx-auto flex max-w-2xl items-center justify-center gap-3 rounded-xl bg-card px-4 py-2">
            <BeadProgress total={REQUIRED_LISTENS} filled={playCount} size="sm" />
            <span className="text-xs font-medium text-foreground">
              {canContinue ? 'Ready!' : `${playCount} / ${REQUIRED_LISTENS} listens`}
            </span>
            {canContinue && (
              <button onClick={onComplete} className="tactile-chip ml-2 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-on-teal">
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
                'tactile-raise-sm relative w-full rounded-xl border-[1.5px] p-4 text-left transition-all',
                isActive
                  ? 'border-teal/60 bg-teal/5'
                  : 'border-ink bg-card hover:border-foreground/45',
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

      <MediaControlsBar
        playingAll={playingAll}
        currentIdx={currentAyahIndex}
        total={ayahs.length}
        idleLabel="Tap ayah or play"
        onPlayAll={playAllAyahs}
        onStop={stopPlayback}
        onRestart={restartPlayback}
      />

      {/* Bottom continue */}
      <Button onClick={onComplete} disabled={!canContinue} className="w-full">
        {canContinue ? 'Continue to Understand' : `Listen ${remaining} more time${remaining !== 1 ? 's' : ''}`}
      </Button>

      {!canContinue && (
        <button
          onClick={onComplete}
          className="mx-auto block text-xs text-muted hover:text-foreground transition-colors"
        >
          Already familiar? Skip to Understand →
        </button>
      )}
    </div>
  );
}
