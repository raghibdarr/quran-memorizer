'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Surah } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { audioController } from '@/lib/audio';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ChunkPhaseProps {
  surah: Surah;
  onComplete: () => void;
}

type Stage =
  | 'listen-repeat'   // Listen to ayah and repeat aloud (text visible)
  | 'recite-hidden'   // Text hidden, recite from memory
  | 'reveal-check'    // Text revealed, self-check
  | 'word-order'      // Bonus: arrange words in order
  | 'chain'           // Chain multiple ayahs together

const REPS_REQUIRED = 4;

export default function ChunkPhase({ surah, onComplete }: ChunkPhaseProps) {
  const { markChunkComplete, updateChunkIndex } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[surah.id]);

  const [ayahIndex, setAyahIndex] = useState(lesson?.phaseData.chunk.currentChunkIndex ?? 0);
  const [stage, setStage] = useState<Stage>('listen-repeat');
  const [repCount, setRepCount] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [completedAyahs, setCompletedAyahs] = useState<Set<number>>(new Set());
  const abortRef = useRef(false);

  // Word ordering state
  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
  const [orderResult, setOrderResult] = useState<'correct' | 'wrong' | null>(null);
  const [shuffledWords, setShuffledWords] = useState<Array<{ position: number; text: string }>>([]);

  const currentAyah = surah.ayahs[ayahIndex];
  const actualWords = useMemo(
    () => currentAyah.words.filter((w) => w.charType === 'word'),
    [currentAyah]
  );
  const isLastAyah = ayahIndex >= surah.ayahs.length - 1;

  useEffect(() => {
    return () => {
      abortRef.current = true;
      audioController.stop();
    };
  }, []);

  // Play the current ayah audio
  const playCurrentAyah = useCallback(async () => {
    await audioController.playAndWait(currentAyah.audioUrl);
  }, [currentAyah]);

  // Auto-play loop: plays the ayah, waits, then repeats
  const startListenRepeat = useCallback(async () => {
    if (isAutoPlaying) return;
    abortRef.current = false;
    setIsAutoPlaying(true);

    const repsLeft = REPS_REQUIRED - repCount;
    for (let i = 0; i < repsLeft; i++) {
      if (abortRef.current) break;
      await audioController.playAndWait(currentAyah.audioUrl);
      if (abortRef.current) break;
      setRepCount((c) => c + 1);
      // Gap between reps for user to repeat aloud
      if (i < repsLeft - 1) {
        await new Promise<void>((r) => setTimeout(r, 2000));
      }
    }
    setIsAutoPlaying(false);
  }, [currentAyah, repCount, isAutoPlaying]);

  const stopAutoPlay = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setIsAutoPlaying(false);
  }, []);

  const handleListenOnce = useCallback(async () => {
    await playCurrentAyah();
    setRepCount((c) => c + 1);
  }, [playCurrentAyah]);

  const canProceedFromListen = repCount >= REPS_REQUIRED;

  // Move to hidden recital stage
  const goToHidden = () => {
    audioController.stop();
    setIsAutoPlaying(false);
    setStage('recite-hidden');
  };

  // Reveal text for self-check
  const goToReveal = () => setStage('reveal-check');

  // Set up word ordering
  const goToWordOrder = () => {
    const shuffled = actualWords
      .map((w) => ({ position: w.position, text: w.textUthmani }))
      .sort(() => Math.random() - 0.5);
    setShuffledWords(shuffled);
    setSelectedOrder([]);
    setOrderResult(null);
    setStage('word-order');
  };

  // Handle word selection in ordering
  const handleWordSelect = (position: number) => {
    if (orderResult !== null) return;

    const newOrder = [...selectedOrder, position];
    setSelectedOrder(newOrder);

    const correctOrder = actualWords.map((w) => w.position);
    const isCorrectSoFar = newOrder.every((p, i) => p === correctOrder[i]);

    if (!isCorrectSoFar) {
      setOrderResult('wrong');
      setTimeout(() => {
        setSelectedOrder([]);
        setOrderResult(null);
      }, 800);
      return;
    }

    if (newOrder.length === correctOrder.length) {
      setOrderResult('correct');
    }
  };

  // Move to next ayah or chain/complete
  const advanceAyah = () => {
    setCompletedAyahs((prev) => new Set([...prev, ayahIndex]));

    if (isLastAyah) {
      // If multiple ayahs, do a chain test; otherwise complete
      if (surah.ayahs.length > 1) {
        setStage('chain');
      } else {
        markChunkComplete(surah.id);
        onComplete();
      }
    } else {
      const next = ayahIndex + 1;
      setAyahIndex(next);
      updateChunkIndex(surah.id, next);
      setStage('listen-repeat');
      setRepCount(0);
      setSelectedOrder([]);
      setOrderResult(null);
    }
  };

  // Chain test: recite full surah from memory
  const [chainRevealed, setChainRevealed] = useState(false);

  if (stage === 'chain') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-foreground">Connect It All</h3>
          <p className="mt-1 text-sm text-muted">
            Now recite the entire surah from memory.
          </p>
        </div>

        {!chainRevealed ? (
          <>
            <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-8 text-center">
              <p className="arabic-text text-2xl text-teal">{surah.nameArabic}</p>
              <p className="mt-2 text-lg font-semibold">{surah.nameSimple}</p>
              <p className="mt-4 text-sm text-muted">
                Recite all {surah.versesCount} ayahs from start to finish
              </p>
            </div>
            <Button onClick={() => setChainRevealed(true)} className="w-full">
              Show Full Surah
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-3">
              {surah.ayahs.map((ayah) => (
                <div key={ayah.key} className="rounded-xl bg-white p-4 shadow-sm">
                  <p className="arabic-text text-center text-2xl leading-loose">
                    {ayah.textUthmani}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setChainRevealed(false);
                  setAyahIndex(0);
                  setRepCount(0);
                  setStage('listen-repeat');
                  setCompletedAyahs(new Set());
                }}
                variant="secondary"
                className="flex-1"
              >
                Practice Again
              </Button>
              <Button
                onClick={() => {
                  markChunkComplete(surah.id);
                  onComplete();
                }}
                className="flex-1"
              >
                Continue to Test
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Build Your Memory</h3>
        <p className="mt-1 text-sm text-muted">
          {stage === 'listen-repeat' && 'Listen and repeat aloud after the reciter.'}
          {stage === 'recite-hidden' && 'Now recite from memory.'}
          {stage === 'reveal-check' && 'Check your recitation.'}
          {stage === 'word-order' && 'Arrange the words in the correct order.'}
        </p>
      </div>

      {/* Ayah progress */}
      <div className="flex justify-center gap-1.5">
        {surah.ayahs.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-2.5 w-2.5 rounded-full transition-colors',
              completedAyahs.has(i) ? 'bg-success' :
              i === ayahIndex ? 'bg-teal' :
              'bg-foreground/10'
            )}
          />
        ))}
      </div>

      <p className="text-center text-xs font-medium text-teal">
        Ayah {ayahIndex + 1} of {surah.ayahs.length}
      </p>

      {/* === STAGE: Listen & Repeat === */}
      {stage === 'listen-repeat' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="arabic-text text-3xl leading-loose">
              {actualWords.map((w) => w.textUthmani).join(' ')}
            </p>
            <p className="mt-3 text-sm text-muted">
              {actualWords.map((w) => w.transliteration).filter(Boolean).join(' ')}
            </p>
          </div>

          {/* Rep counter */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: REPS_REQUIRED }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-3 w-3 rounded-full transition-all',
                    i < repCount ? 'bg-success scale-110' : 'bg-foreground/10'
                  )}
                />
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">
              {repCount < REPS_REQUIRED
                ? `Listen & repeat aloud — ${REPS_REQUIRED - repCount} more`
                : 'Ready to test your memory!'}
            </p>
          </div>

          {/* Audio controls */}
          <div className="flex justify-center gap-3">
            {isAutoPlaying ? (
              <button
                onClick={stopAutoPlay}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <rect x="4" y="4" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <>
                <button
                  onClick={handleListenOnce}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-teal text-white shadow-lg transition-transform hover:scale-105"
                  title="Play once"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6 4l10 6-10 6V4z" />
                  </svg>
                </button>
                {repCount < REPS_REQUIRED && (
                  <button
                    onClick={startListenRepeat}
                    className="flex h-14 items-center gap-2 rounded-full bg-gold text-white px-5 shadow-lg transition-transform hover:scale-105"
                    title="Auto-repeat"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 4h10l-3-3 1-1 5 5-5 5-1-1 3-3H2V4zm12 8H4l3 3-1 1-5-5 5-5 1 1-3 3h10v2z" />
                    </svg>
                    <span className="text-sm font-semibold">Auto</span>
                  </button>
                )}
              </>
            )}
          </div>

          {canProceedFromListen && (
            <Button onClick={goToHidden} className="w-full">
              Test My Memory
            </Button>
          )}
        </div>
      )}

      {/* === STAGE: Recite Hidden === */}
      {stage === 'recite-hidden' && (
        <div className="space-y-5">
          <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-10 text-center">
            <p className="text-lg font-medium text-muted">Recite from memory...</p>
            <p className="mt-2 text-sm text-muted">
              Say the ayah aloud, then check your answer
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => setStage('listen-repeat')} variant="ghost" className="flex-1">
              Hear it again
            </Button>
            <Button onClick={goToReveal} className="flex-1">
              Check Answer
            </Button>
          </div>
        </div>
      )}

      {/* === STAGE: Reveal & Check === */}
      {stage === 'reveal-check' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-success/5 p-6 text-center">
            <p className="arabic-text text-3xl leading-loose">
              {actualWords.map((w) => w.textUthmani).join(' ')}
            </p>
            <p className="mt-3 text-sm text-muted">
              {actualWords.map((w) => w.transliteration).filter(Boolean).join(' ')}
            </p>
          </div>

          <p className="text-center text-sm font-medium">Did you get it right?</p>

          <div className="flex gap-3">
            <Button
              onClick={() => {
                setStage('listen-repeat');
                setRepCount(0);
              }}
              variant="secondary"
              className="flex-1"
            >
              Need More Practice
            </Button>
            <Button onClick={goToWordOrder} className="flex-1">
              Got It
            </Button>
          </div>
        </div>
      )}

      {/* === STAGE: Word Order (bonus) === */}
      {stage === 'word-order' && (
        <div className="space-y-5">
          <p className="text-center text-sm text-muted">
            Arrange the words in correct order (right to left)
          </p>

          {/* Drop zone */}
          <div
            className="flex min-h-[56px] flex-wrap justify-center gap-2 rounded-xl border-2 border-dashed border-foreground/20 p-3"
            dir="rtl"
          >
            {selectedOrder.length === 0 && (
              <span className="text-sm text-muted py-2">Tap words below...</span>
            )}
            {selectedOrder.map((pos, i) => {
              const word = actualWords.find((w) => w.position === pos);
              return (
                <span
                  key={i}
                  className={cn(
                    'arabic-text rounded-lg px-3 py-1.5 text-xl',
                    orderResult === 'wrong' ? 'bg-red-100 text-red-600' :
                    orderResult === 'correct' ? 'bg-success/10 text-success' :
                    'bg-teal/10 text-teal'
                  )}
                >
                  {word?.textUthmani}
                </span>
              );
            })}
          </div>

          {/* Word bank */}
          <div className="flex flex-wrap justify-center gap-2" dir="rtl">
            {shuffledWords.map((word) => {
              const isUsed = selectedOrder.includes(word.position);
              return (
                <button
                  key={word.position}
                  onClick={() => handleWordSelect(word.position)}
                  disabled={isUsed || orderResult !== null}
                  className={cn(
                    'arabic-text rounded-xl border-2 px-4 py-2 text-xl transition-all',
                    isUsed
                      ? 'border-transparent bg-foreground/5 text-foreground/20'
                      : 'border-foreground/10 bg-white hover:border-gold'
                  )}
                >
                  {word.text}
                </button>
              );
            })}
          </div>

          {orderResult === 'correct' && (
            <Button onClick={advanceAyah} className="w-full">
              {isLastAyah
                ? surah.ayahs.length > 1 ? 'Connect All Ayahs' : 'Complete'
                : 'Next Ayah'}
            </Button>
          )}

          {orderResult === 'wrong' && (
            <p className="text-center text-sm text-red-500">Not quite — try again!</p>
          )}
        </div>
      )}
    </div>
  );
}
