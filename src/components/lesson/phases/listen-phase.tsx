'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Surah, Ayah, Word } from '@/types/quran';
import { useAudio } from '@/hooks/use-audio';
import { useProgressStore } from '@/stores/progress-store';
import { useSettingsStore } from '@/stores/settings-store';
import BeadProgress from '@/components/ui/bead-progress';
import Button from '@/components/ui/button';
import MediaControlsBar from '@/components/ui/media-controls-bar';
import { cn } from '@/lib/cn';
import { audioController } from '@/lib/audio';
import { getAudioUrl as buildAudioUrl } from '@/lib/quran-data';
import { buildAyahWordData } from '@/lib/segments';
import { wordAudioUrl } from '@/lib/word-audio';
import { useSpokenWord } from '@/hooks/use-spoken-word';

interface ListenPhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonId: string;
  onComplete: () => void;
}

const REQUIRED_LISTENS = 3;

/**
 * Listen and understand (owner, 2026-09-28): the old separate Understand step —
 * paging a card deck to tap words, gated on visiting every card — merged into the
 * three listens. The translation sits under every ayah while it's recited, and
 * each word is a tile you can tap to hear it alone and see what it means.
 */
export default function ListenPhase({ surah, ayahs, lessonId, onComplete }: ListenPhaseProps) {
  const { isPlaying } = useAudio();
  const { incrementListenCount, markUnderstandComplete } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[lessonId]);
  const playCount = lesson?.phaseData.listen.playCount ?? 0;
  const transliterationEnabled = useSettingsStore((s) => s.transliterationEnabled);
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(-1);
  const [playingAll, setPlayingAll] = useState(false);
  const [selected, setSelected] = useState<{ ayahIdx: number; word: Word } | null>(null);
  const spokenWord = useSpokenWord(surah.id, currentAyahIndex >= 0 ? ayahs[currentAyahIndex].number : null, isPlaying);
  const abortRef = useRef(false);
  const ayahRefs = useRef<(HTMLElement | null)[]>([]);
  const counterRef = useRef<HTMLDivElement>(null);
  const [counterPinned, setCounterPinned] = useState(false);

  // Per-word Arabic in the chosen script (tajweed/indopak derived with count-checked fallbacks)
  const ayahData = useMemo(() => ayahs.map((a) => buildAyahWordData(a)), [ayahs]);

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
    // pin once the counter slides under the lesson header
    const header = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--lesson-header-height')) || 120;
    const observer = new IntersectionObserver(
      ([entry]) => setCounterPinned(!entry.isIntersecting),
      { threshold: 0, rootMargin: `-${header}px 0px 0px 0px` }
    );
    observer.observe(counterRef.current);
    return () => observer.disconnect();
  }, []);

  // Autoscroll to current ayah
  useEffect(() => {
    if (currentAyahIndex >= 0 && ayahRefs.current[currentAyahIndex]) {
      ayahRefs.current[currentAyahIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentAyahIndex]);

  const playAllAyahs = useCallback(async () => {
    if (playingAll) return;
    abortRef.current = false;
    setPlayingAll(true);
    setSelected(null);

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
    if (!abortRef.current) incrementListenCount(lessonId);
  }, [surah, ayahs, incrementListenCount, playingAll, lessonId]);

  const stopPlayback = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
    setCurrentAyahIndex(-1);
  }, []);

  const restartPlayback = useCallback(() => {
    stopPlayback();
    // Small delay to let state settle before restarting
    setTimeout(() => { playAllAyahs(); }, 100);
  }, [playAllAyahs, stopPlayback]);

  // Hearing every ayah one by one also counts as a listen
  const [, setIndividualPlays] = useState(new Set<number>());

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
  }, [surah, ayahs, playingAll, incrementListenCount, lessonId]);

  const tapWord = (ayahIdx: number, word: Word, wordIdx: number) => {
    if (playingAll) return;
    setSelected({ ayahIdx, word });
    const url = wordAudioUrl(word, wordIdx);
    if (url) audioController.play(url);
  };

  const finish = () => {
    stopPlayback();
    markUnderstandComplete(lessonId);
    onComplete();
  };

  const renderWord = (ayahIdx: number, wi: number, fallback: string) => {
    const { tajweedWords, indopakWords } = ayahData[ayahIdx];
    if (arabicScript === 'tajweed' && tajweedWords) {
      return <span className="arabic-text tajweed-text" dangerouslySetInnerHTML={{ __html: tajweedWords[wi] }} />;
    }
    if (arabicScript === 'indopak' && indopakWords) return <span className="arabic-text-indopak">{indopakWords[wi]}</span>;
    return <span className="arabic-text">{fallback}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Listen and understand</h3>
        <p className="mt-1 text-sm text-muted">
          Listen to the lesson {REQUIRED_LISTENS} times while you read the meaning. Tap any word to hear it on its own and see what it means.
        </p>
      </div>

      {/* Listen counter (observed for sticky) */}
      <div ref={counterRef}>
        <div className="flex items-center justify-center gap-3 rounded-xl border border-foreground/10 bg-card p-3">
          <BeadProgress total={REQUIRED_LISTENS} filled={playCount} showCurrent />
          <span className="text-sm font-medium text-foreground">
            {canContinue ? 'Ready to memorize' : `${playCount} / ${REQUIRED_LISTENS} listens`}
          </span>
        </div>
      </div>

      {/* Pinned counter (appears when original scrolls out) */}
      {counterPinned && (
        <div className="fixed left-0 right-0 z-20 px-4" style={{ top: 'calc(var(--safe-top) + var(--lesson-header-height, 120px) + 0.5rem)' }}>
          <div className="tactile-card mx-auto flex max-w-2xl items-center justify-center gap-3 rounded-xl bg-card px-4 py-2">
            <BeadProgress total={REQUIRED_LISTENS} filled={playCount} size="sm" />
            <span className="text-xs font-medium text-foreground">
              {canContinue ? 'Ready' : `${playCount} / ${REQUIRED_LISTENS} listens`}
            </span>
            {canContinue && (
              <button onClick={finish} className="hit-44 tactile-chip ml-2 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-on-teal">
                Continue
              </button>
            )}
          </div>
        </div>
      )}

      {canContinue && (
        <Button onClick={finish} className="w-full">
          Continue to Memorize
        </Button>
      )}

      {/* Ayah cards: tap a word to hear it; the play button plays the ayah */}
      <div className="space-y-3">
        {ayahs.map((ayah, i) => {
          const isActive = i === currentAyahIndex;
          const { words } = ayahData[i];
          const pick = selected?.ayahIdx === i ? selected.word : null;
          return (
            <div
              key={ayah.key}
              ref={(el) => { ayahRefs.current[i] = el; }}
              className={cn(
                'tactile-raise-sm relative rounded-xl border-[1.5px] p-4 transition-all',
                isActive ? 'border-teal/60 bg-teal/5' : 'border-ink bg-card',
                playingAll && !isActive && 'opacity-40',
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => playSingleAyah(i)}
                  disabled={playingAll}
                  aria-label={`Play ayah ${ayah.number}`}
                  className={cn('hit-44 flex items-center gap-1.5 text-xs', isActive ? 'text-teal' : 'text-muted')}
                >
                  {isActive && isPlaying ? (
                    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
                      <span className="w-[3px] animate-[bar1_0.8s_ease-in-out_infinite] rounded-full bg-teal" />
                      <span className="w-[3px] animate-[bar2_0.8s_ease-in-out_infinite_0.2s] rounded-full bg-teal" />
                      <span className="w-[3px] animate-[bar3_0.8s_ease-in-out_infinite_0.4s] rounded-full bg-teal" />
                    </span>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M4 2l10 6-10 6V2z" /></svg>
                  )}
                  Ayah {ayah.number}
                </button>
              </div>

              <div dir="rtl" className="mt-2 flex flex-wrap justify-center gap-x-1 gap-y-1 text-4xl leading-loose">
                {words.map((word, wi) => (
                  <button
                    key={word.position}
                    onClick={() => tapWord(i, word, wi)}
                    disabled={playingAll}
                    aria-label={word.translation ? `${word.transliteration ?? ''} — ${word.translation}` : undefined}
                    className={cn(
                      'rounded-lg px-1 transition-colors',
                      pick?.position === word.position || (isActive && wi === spokenWord) ? 'bg-gold/25' : 'hover:bg-gold/10',
                    )}
                  >
                    {renderWord(i, wi, word.textUthmani)}
                  </button>
                ))}
              </div>

              {transliterationEnabled && ayah.transliteration && (
                <p className="mt-1 text-center text-sm text-muted">{ayah.transliteration}</p>
              )}
              {/* The meaning is the point of this step, so it shows whatever the translation setting */}
              {ayah.translation && <p className="mt-1 text-center text-sm italic text-muted">{ayah.translation}</p>}

              {pick && (
                <div data-word-meaning className="mt-3 animate-[phase-in_200ms_ease-out] rounded-xl bg-teal/5 px-3 py-2 text-center">
                  {pick.transliteration && <span className="text-sm text-muted">{pick.transliteration} · </span>}
                  <span className="text-sm font-semibold text-teal">{pick.translation ?? '—'}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <MediaControlsBar
        playingAll={playingAll}
        currentIdx={currentAyahIndex}
        total={ayahs.length}
        idleLabel="Play the whole lesson"
        onPlayAll={playAllAyahs}
        onStop={stopPlayback}
        onRestart={restartPlayback}
      />

      {/* Bottom continue */}
      <Button onClick={finish} disabled={!canContinue} className="w-full">
        {canContinue ? 'Continue to Memorize' : `Listen ${remaining} more time${remaining !== 1 ? 's' : ''}`}
      </Button>

      {!canContinue && (
        <button onClick={finish} className="mx-auto block min-h-11 text-xs text-muted transition-colors hover:text-foreground">
          Already familiar? Skip to Memorize →
        </button>
      )}
    </div>
  );
}
