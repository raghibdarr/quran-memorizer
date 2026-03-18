'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Surah, Ayah } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { audioController } from '@/lib/audio';
import { getAudioUrl as buildAudioUrl } from '@/lib/quran-data';
import { useSettingsStore } from '@/stores/settings-store';
import ArabicText from '@/components/ui/arabic-text';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ChunkPhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonId: string;
  startAtReview?: boolean;
  onComplete: () => void;
}

// === ABCD Progressive Chaining with 6-4-4-6 Pattern ===
//
// For each ayah (chunk):
//   Step 1: Listen with text visible (6 reps)
//   Step 2: Recite from memory (4 reps) — self-report
//   Step 3: Listen with text again (4 reps) — reinforce
//   Step 4: Recite from memory (6 reps) — solidify
//   Step 5: Word ordering exercise — bonus validation
//
// After each new ayah, CHAIN with all previous:
//   After B: recite A+B from memory
//   After C: recite A+B+C from memory
//   etc.
//
// Final: recite entire surah from memory

type MainStage =
  | 'learning'     // Working on a single ayah (6-4-4-6)
  | 'chaining'     // Reciting accumulated ayahs from memory
  | 'final-chain'; // Recite full surah from memory

type LearnStep =
  | 'listen-with-text'      // 6x: listen + repeat, text visible
  | 'recite-from-memory'    // 4x: text hidden, self-report each rep
  | 'reinforce-with-text'   // 4x: text visible again, listen + repeat
  | 'final-memory'          // 6x: text hidden, solidify
  | 'word-order';           // arrange words

const STEP_REPS: Record<Exclude<LearnStep, 'word-order'>, number> = {
  'listen-with-text': 6,
  'recite-from-memory': 4,
  'reinforce-with-text': 4,
  'final-memory': 6,
};

const STEP_LABELS: Record<LearnStep, string> = {
  'listen-with-text': 'Listen & repeat aloud with the text',
  'recite-from-memory': 'Now recite from memory',
  'reinforce-with-text': 'Listen again to reinforce',
  'final-memory': 'Final recall — recite from memory',
  'word-order': 'Arrange the words in order',
};

const LEARN_STEPS: LearnStep[] = [
  'listen-with-text',
  'recite-from-memory',
  'reinforce-with-text',
  'final-memory',
  'word-order',
];

export default function ChunkPhase({ surah, ayahs, lessonId, startAtReview, onComplete }: ChunkPhaseProps) {
  const { markChunkComplete, updateChunkIndex } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[lessonId]);
  const getAudioUrl = (surahId: number, ayahNum: number) =>
    buildAudioUrl(surahId, ayahNum, useSettingsStore.getState().reciter);

  // Which ayah we're working on — clamp to valid range
  const savedIndex = lesson?.phaseData.chunk.currentChunkIndex ?? 0;
  const [ayahIndex, setAyahIndex] = useState(
    Math.min(savedIndex, ayahs.length - 1)
  );
  const [mainStage, setMainStage] = useState<MainStage>(startAtReview ? 'final-chain' : 'learning');

  // Learning state (6-4-4-6 within a single ayah)
  const [learnStep, setLearnStep] = useState<LearnStep>('listen-with-text');
  const [repCount, setRepCount] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isPlayingOnce, setIsPlayingOnce] = useState(false);
  const [completedAyahs, setCompletedAyahs] = useState<Set<number>>(new Set());
  const [currentSpeed, setCurrentSpeed] = useState(() => audioController.speed);

  // Chaining state
  const [chainAyahIndex, setChainAyahIndex] = useState(0);
  const [chainRevealed, setChainRevealed] = useState(false);
  const [revealedAyahs, setRevealedAyahs] = useState<Set<number>>(new Set());

  // Single-ayah practice mode (returns to final-chain when done)
  const [practiceReturnStage, setPracticeReturnStage] = useState<MainStage | null>(null);

  // Word ordering state
  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
  const [orderResult, setOrderResult] = useState<'correct' | 'wrong' | null>(null);
  const [shuffledWords, setShuffledWords] = useState<Array<{ position: number; text: string; transliteration: string | null }>>([]);

  const abortRef = useRef(false);

  const currentAyah = ayahs[ayahIndex];
  const actualWords = useMemo(
    () => currentAyah?.words.filter((w) => w.charType === 'word') ?? [],
    [currentAyah]
  );

  const currentStepReps = learnStep !== 'word-order' ? STEP_REPS[learnStep] : 0;
  const isTextVisible = learnStep === 'listen-with-text' || learnStep === 'reinforce-with-text';

  useEffect(() => {
    return () => { abortRef.current = true; audioController.stop(); };
  }, []);

  // --- Audio controls ---

  const playOnce = useCallback(async () => {
    if (!currentAyah || isPlayingOnce || isAutoPlaying) return;
    setIsPlayingOnce(true);
    await audioController.playAndWait(getAudioUrl(surah.id, currentAyah.number));
    setRepCount((c) => c + 1);
    setIsPlayingOnce(false);
  }, [currentAyah]);

  const startAutoPlay = useCallback(async () => {
    if (isAutoPlaying || !currentAyah) return;
    abortRef.current = false;
    setIsAutoPlaying(true);

    const repsLeft = currentStepReps - repCount;
    for (let i = 0; i < repsLeft; i++) {
      if (abortRef.current) break;
      await audioController.playAndWait(getAudioUrl(surah.id, currentAyah.number));
      if (abortRef.current) break;
      setRepCount((c) => c + 1);
      if (i < repsLeft - 1) {
        await new Promise<void>((r) => setTimeout(r, 2000));
      }
    }
    setIsAutoPlaying(false);
  }, [currentAyah, repCount, currentStepReps, isAutoPlaying]);

  const stopAutoPlay = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setIsAutoPlaying(false);
  }, []);

  // --- Step progression ---

  const advanceLearnStep = () => {
    const idx = LEARN_STEPS.indexOf(learnStep);
    if (idx < LEARN_STEPS.length - 1) {
      const next = LEARN_STEPS[idx + 1];
      setLearnStep(next);
      setRepCount(0);

      // Set up word ordering
      if (next === 'word-order') {
        const shuffled = actualWords
          .map((w) => ({ position: w.position, text: w.textUthmani, transliteration: w.transliteration }))
          .sort(() => Math.random() - 0.5);
        setShuffledWords(shuffled);
        setSelectedOrder([]);
        setOrderResult(null);
      }
    }
  };

  // After completing an ayah (all steps), either chain or move to next
  const completeCurrentAyah = () => {
    const newCompleted = new Set([...completedAyahs, ayahIndex]);
    setCompletedAyahs(newCompleted);

    // If practicing a single ayah, return to where we came from
    if (practiceReturnStage) {
      const returnTo = practiceReturnStage;
      setPracticeReturnStage(null);
      setMainStage(returnTo);
      setChainRevealed(false);
      setRevealedAyahs(new Set());
      return;
    }

    if (ayahIndex === 0 && ayahs.length > 1) {
      // First ayah — skip chaining, go straight to next
      moveToNextAyah();
    } else if (ayahIndex < ayahs.length - 1) {
      // Chain all completed ayahs before moving to next
      setMainStage('chaining');
      setChainAyahIndex(0);
      setChainRevealed(false);
      setRevealedAyahs(new Set());
    } else {
      // Last ayah — final chain of everything
      setMainStage('final-chain');
      setChainRevealed(false);
      setRevealedAyahs(new Set());
    }
  };

  const moveToNextAyah = () => {
    const next = ayahIndex + 1;
    setAyahIndex(next);
    updateChunkIndex(lessonId, next);
    setMainStage('learning');
    setLearnStep('listen-with-text');
    setRepCount(0);
  };

  // --- Memory recall for text-hidden steps ---

  const [memoryRevealed, setMemoryRevealed] = useState(false);

  const handleMemoryRep = async (gotIt: boolean) => {
    if (gotIt) {
      setRepCount((c) => c + 1);
    } else {
      // On fail, replay the audio to reinforce before next attempt
      if (currentAyah) {
        await audioController.playAndWait(getAudioUrl(surah.id, currentAyah.number));
      }
    }
    setMemoryRevealed(false);
  };

  // Contextual encouragement for memory steps
  const getRecallPrompt = (): { title: string; subtitle: string } => {
    const isFirst = repCount === 0;
    const isLast = repCount === currentStepReps - 1;
    const isFinalStep = learnStep === 'final-memory';

    if (isFinalStep) {
      if (isFirst) return { title: 'Final recall — no peeking!', subtitle: 'Recite the ayah from memory, then check' };
      if (isLast) return { title: 'Last one — you\'ve got this!', subtitle: 'One more successful recall to prove it\'s solid' };
      return { title: `Recall ${repCount + 1} of ${currentStepReps}`, subtitle: 'Keep going — each recall strengthens the memory' };
    }

    if (isFirst) return { title: 'Time to test your memory', subtitle: 'Try to recite without looking, then reveal to check' };
    if (isLast) return { title: 'Almost there!', subtitle: 'One more successful recall before the next step' };
    return { title: `Recall ${repCount + 1} of ${currentStepReps}`, subtitle: 'Repeat — each time makes it stronger' };
  };

  // --- Word ordering ---

  const handleWordSelect = (position: number) => {
    if (orderResult !== null) return;
    const newOrder = [...selectedOrder, position];
    setSelectedOrder(newOrder);

    const correctOrder = actualWords.map((w) => w.position);
    const isCorrectSoFar = newOrder.every((p, i) => p === correctOrder[i]);

    if (!isCorrectSoFar) {
      setOrderResult('wrong');
      setTimeout(() => { setSelectedOrder([]); setOrderResult(null); }, 800);
      return;
    }
    if (newOrder.length === correctOrder.length) {
      setOrderResult('correct');
    }
  };

  // ============================================================
  // RENDER: CHAINING (recite accumulated ayahs A+B, A+B+C, etc.)
  // ============================================================

  if (mainStage === 'chaining') {
    const chainAyahs = ayahs.slice(0, ayahIndex + 1);
    const allRevealed = chainRevealed || revealedAyahs.size >= chainAyahs.length;

    const toggleAyahReveal = (i: number) => {
      setRevealedAyahs((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
      });
    };

    const revealAll = () => {
      setChainRevealed(true);
      setRevealedAyahs(new Set(chainAyahs.map((_, i) => i)));
    };

    const resetChain = () => {
      setChainRevealed(false);
      setRevealedAyahs(new Set());
    };

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-foreground">Chain Together</h3>
          <p className="mt-1 text-sm text-muted">
            Recite ayahs {chainAyahs[0].number}–{chainAyahs[chainAyahs.length - 1].number} from memory. Tap each to reveal, or reveal all at once.
          </p>
        </div>

        <div className="space-y-3">
          {chainAyahs.map((ayah, i) => {
            const isRevealed = revealedAyahs.has(i) || chainRevealed;
            return (
              <button
                key={ayah.key}
                onClick={() => !isRevealed && toggleAyahReveal(i)}
                className={cn(
                  'w-full rounded-xl p-4 text-left transition-all',
                  isRevealed
                    ? 'bg-success/5'
                    : 'border-2 border-dashed border-foreground/15 cursor-pointer hover:border-foreground/25'
                )}
              >
                {isRevealed ? (
                  <AyahDisplay ayah={ayah} />
                ) : (
                  <p className="text-center text-sm text-muted py-2">
                    Ayah {ayah.number} — tap to reveal
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {!allRevealed && (
          <Button onClick={revealAll} variant="secondary" className="w-full">
            Reveal All
          </Button>
        )}

        {allRevealed && (
          <div className="flex gap-3">
            <Button onClick={resetChain} variant="secondary" className="flex-1">
              Try Again
            </Button>
            <Button onClick={moveToNextAyah} className="flex-1">
              Learn Next Ayah
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // RENDER: FINAL CHAIN (full surah from memory)
  // ============================================================

  if (mainStage === 'final-chain') {
    const firstAyah = ayahs[0].number;
    const lastAyah = ayahs[ayahs.length - 1].number;
    const isSingleLesson = ayahs.length === surah.versesCount;
    const allFinalRevealed = chainRevealed || revealedAyahs.size >= ayahs.length;

    const revealAllFinal = () => {
      setChainRevealed(true);
      setRevealedAyahs(new Set(ayahs.map((_, i) => i)));
    };

    const resetFinalChain = () => {
      setChainRevealed(false);
      setRevealedAyahs(new Set());
    };

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-foreground">Complete Recitation</h3>
          <p className="mt-1 text-sm text-muted">
            {isSingleLesson
              ? `Recite ${surah.nameSimple} from start to finish`
              : `Recite ayahs ${firstAyah}–${lastAyah} from memory`}
          </p>
          <p className="mt-0.5 text-xs text-muted">Tap each ayah to reveal, or reveal all at once</p>
        </div>

        <div className="space-y-3">
          {ayahs.map((ayah, i) => {
            const isRevealed = revealedAyahs.has(i) || chainRevealed;
            return (
              <button
                key={ayah.key}
                onClick={() => !isRevealed && setRevealedAyahs((prev) => new Set([...prev, i]))}
                className={cn(
                  'w-full rounded-xl p-4 text-left transition-all',
                  isRevealed
                    ? 'bg-card shadow-sm'
                    : 'border-2 border-dashed border-foreground/15 cursor-pointer hover:border-foreground/25'
                )}
              >
                {isRevealed ? (
                  <AyahDisplay ayah={ayah} />
                ) : (
                  <p className="text-center text-sm text-muted py-2">
                    Ayah {ayah.number} — tap to reveal
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {!allFinalRevealed && (
          <Button onClick={revealAllFinal} variant="secondary" className="w-full">
            Reveal All
          </Button>
        )}

        {allFinalRevealed && (
          <>
            {/* Practice specific ayahs */}
            <div className="rounded-xl bg-foreground/[0.03] p-4">
              <p className="text-xs font-medium text-muted mb-2">Need to practice a specific ayah?</p>
              <div className="flex flex-wrap gap-2">
                {ayahs.map((ayah, i) => (
                  <button
                    key={ayah.key}
                    onClick={() => {
                      setAyahIndex(i);
                      setRepCount(0);
                      setPracticeReturnStage('final-chain');
                      setMainStage('learning');
                      setLearnStep('listen-with-text');
                    }}
                    className="rounded-lg bg-card border border-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground hover:border-teal transition-colors"
                  >
                    Ayah {ayah.number}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={resetFinalChain} variant="secondary" className="flex-1">
                Try Again
              </Button>
              <Button
                onClick={() => { markChunkComplete(lessonId); onComplete(); }}
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

  // ============================================================
  // RENDER: LEARNING A SINGLE AYAH (6-4-4-6 + word order)
  // ============================================================

  const stepIndex = LEARN_STEPS.indexOf(learnStep);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Build Your Memory</h3>
        <p className="mt-1 text-sm text-muted">{STEP_LABELS[learnStep]}</p>
      </div>

      {/* Practice mode navigation — switch ayahs or return to recitation */}
      {practiceReturnStage && (
        <div className="rounded-xl bg-foreground/[0.03] border border-foreground/10 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted">Practicing Ayah {currentAyah?.number}</p>
            <button
              onClick={() => {
                const returnTo = practiceReturnStage;
                setPracticeReturnStage(null);
                setMainStage(returnTo);
                setChainRevealed(false);
                setRevealedAyahs(new Set());
              }}
              className="text-xs font-medium text-teal hover:underline"
            >
              Skip to final review →
            </button>
          </div>
          <div className="mt-2 flex gap-1.5">
            {ayahs.map((ayah, i) => (
              <button
                key={ayah.key}
                onClick={() => {
                  setAyahIndex(i);
                  setRepCount(0);
                  setLearnStep('listen-with-text');
                }}
                className={cn(
                  'flex-1 rounded-lg py-1.5 text-center text-xs font-medium transition-colors',
                  i === ayahIndex ? 'bg-teal text-white' : 'bg-foreground/5 text-muted hover:bg-foreground/10'
                )}
              >
                {ayah.number}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ayah progress dots */}
      <div className="flex justify-center gap-1.5">
        {ayahs.map((_, i) => (
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
        Ayah {ayahIndex + 1} of {ayahs.length}
      </p>

      {/* Step progress bar */}
      <div className="flex gap-1">
        {LEARN_STEPS.map((step, i) => (
          <div
            key={step}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < stepIndex ? 'bg-success' :
              i === stepIndex ? 'bg-teal' :
              'bg-foreground/10'
            )}
          />
        ))}
      </div>

      {/* === TEXT-VISIBLE STEPS (listen-with-text, reinforce-with-text) === */}
      {isTextVisible && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-card p-6 shadow-sm">
            <AyahDisplay ayah={currentAyah} />
          </div>

          {/* Rep counter */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              {Array.from({ length: currentStepReps }).map((_, i) => (
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
              {repCount < currentStepReps
                ? `${currentStepReps - repCount} repetitions remaining`
                : 'Done! Move to next step.'}
            </p>
          </div>

          {/* Audio controls */}
          <div className="flex items-center justify-center gap-3">
            {isAutoPlaying ? (
              <button onClick={stopAutoPlay} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="4" y="4" width="12" height="12" rx="2" /></svg>
              </button>
            ) : (
              <>
                <button
                  onClick={playOnce}
                  disabled={repCount >= currentStepReps || isPlayingOnce}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-teal text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-40"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M6 4l10 6-10 6V4z" /></svg>
                </button>
                {repCount < currentStepReps && (
                  <button
                    onClick={startAutoPlay}
                    className="flex h-14 items-center gap-2 rounded-full bg-gold text-white px-5 shadow-lg transition-transform hover:scale-105"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h10l-3-3 1-1 5 5-5 5-1-1 3-3H2V4zm12 8H4l3 3-1 1-5-5 5-5 1 1-3 3h10v2z" /></svg>
                    <span className="text-sm font-semibold">Auto</span>
                  </button>
                )}
              </>
            )}

          </div>

          {/* Speed buttons */}
          <div className="flex justify-center gap-1">
            {[0.5, 0.75, 1, 1.25, 1.5].map((s) => (
              <button
                key={s}
                onClick={() => { setCurrentSpeed(s); audioController.setSpeed(s); }}
                className={cn(
                  'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                  s === currentSpeed ? 'bg-teal text-white' : 'text-muted hover:text-foreground'
                )}
              >
                {s}x
              </button>
            ))}
          </div>

          {repCount >= currentStepReps && (
            <Button onClick={advanceLearnStep} className="w-full">
              Next Step
            </Button>
          )}
        </div>
      )}

      {/* === TEXT-HIDDEN STEPS (recite-from-memory, final-memory) === */}
      {!isTextVisible && learnStep !== 'word-order' && (() => {
        const prompt = getRecallPrompt();
        const done = repCount >= currentStepReps;

        return (
          <div className="space-y-5">
            {/* Rep counter */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5">
                {Array.from({ length: currentStepReps }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-3 w-3 rounded-full transition-all',
                      i < repCount ? 'bg-success scale-110' : 'bg-foreground/10'
                    )}
                  />
                ))}
              </div>
            </div>

            {done && !memoryRevealed ? (
              /* All reps completed — advance */
              <div className="space-y-4 text-center">
                <div className="rounded-2xl bg-success/5 p-6">
                  <p className="text-lg font-semibold text-success">
                    {learnStep === 'final-memory' ? 'Memory locked in!' : 'Looking good!'}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {learnStep === 'final-memory'
                      ? 'Time for a word challenge to confirm'
                      : 'Let\'s reinforce with the text one more time'}
                  </p>
                </div>
                <Button onClick={advanceLearnStep} className="w-full">
                  {learnStep === 'final-memory' ? 'Word Challenge' : 'Next Step'}
                </Button>
              </div>
            ) : !memoryRevealed ? (
              /* Recall prompt */
              <>
                <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-8 text-center">
                  <p className="text-lg font-medium text-foreground">{prompt.title}</p>
                  <p className="mt-2 text-sm text-muted">{prompt.subtitle}</p>
                </div>
                <Button onClick={() => setMemoryRevealed(true)} className="w-full">
                  I've recited — show me the answer
                </Button>
              </>
            ) : (
              /* Answer revealed */
              <>
                <div className="rounded-xl bg-success/5 p-5">
                  <AyahDisplay ayah={currentAyah} />
                </div>
                <p className="text-center text-sm text-muted">Did you recite it correctly?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleMemoryRep(false)}
                    className="flex-1 rounded-xl border-2 border-foreground/10 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5"
                  >
                    Not quite — hear it again
                  </button>
                  <Button
                    onClick={() => handleMemoryRep(true)}
                    className="flex-1"
                  >
                    Got it &#10003;
                  </Button>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* === WORD ORDER STEP === */}
      {learnStep === 'word-order' && (
        <div className="space-y-5">
          <p className="text-center text-sm text-muted">
            Arrange the words in correct order (right to left)
          </p>

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

          <div className="flex flex-wrap justify-center gap-2" dir="rtl">
            {shuffledWords.map((word) => {
              const isUsed = selectedOrder.includes(word.position);
              return (
                <button
                  key={word.position}
                  onClick={() => handleWordSelect(word.position)}
                  disabled={isUsed || orderResult !== null}
                  className={cn(
                    'flex flex-col items-center rounded-xl border-2 px-4 py-2 transition-all',
                    isUsed
                      ? 'border-transparent bg-foreground/5 text-foreground/20'
                      : 'border-foreground/10 bg-card hover:border-gold'
                  )}
                >
                  <span className="arabic-text text-xl">{word.text}</span>
                  {word.transliteration && (
                    <span className="text-[10px] text-muted" dir="ltr">{word.transliteration}</span>
                  )}
                </button>
              );
            })}
          </div>

          {orderResult === 'correct' && (
            <Button onClick={completeCurrentAyah} className="w-full">
              {ayahIndex === 0 && ayahs.length > 1
                ? 'Learn Next Ayah'
                : ayahIndex < ayahs.length - 1
                ? 'Chain & Continue'
                : 'Final Recitation'}
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
