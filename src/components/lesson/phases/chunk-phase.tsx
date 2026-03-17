'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Surah, Ayah } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { audioController } from '@/lib/audio';
import ArabicText from '@/components/ui/arabic-text';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ChunkPhaseProps {
  surah: Surah;
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

export default function ChunkPhase({ surah, onComplete }: ChunkPhaseProps) {
  const { markChunkComplete, updateChunkIndex } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[surah.id]);

  // Which ayah we're working on — clamp to valid range
  const savedIndex = lesson?.phaseData.chunk.currentChunkIndex ?? 0;
  const [ayahIndex, setAyahIndex] = useState(
    Math.min(savedIndex, surah.ayahs.length - 1)
  );
  const [mainStage, setMainStage] = useState<MainStage>('learning');

  // Learning state (6-4-4-6 within a single ayah)
  const [learnStep, setLearnStep] = useState<LearnStep>('listen-with-text');
  const [repCount, setRepCount] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [completedAyahs, setCompletedAyahs] = useState<Set<number>>(new Set());

  // Chaining state
  const [chainAyahIndex, setChainAyahIndex] = useState(0);
  const [chainRevealed, setChainRevealed] = useState(false);

  // Word ordering state
  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
  const [orderResult, setOrderResult] = useState<'correct' | 'wrong' | null>(null);
  const [shuffledWords, setShuffledWords] = useState<Array<{ position: number; text: string }>>([]);

  const abortRef = useRef(false);

  const currentAyah = surah.ayahs[ayahIndex];
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
    if (!currentAyah) return;
    await audioController.playAndWait(currentAyah.audioUrl);
    setRepCount((c) => c + 1);
  }, [currentAyah]);

  const startAutoPlay = useCallback(async () => {
    if (isAutoPlaying || !currentAyah) return;
    abortRef.current = false;
    setIsAutoPlaying(true);

    const repsLeft = currentStepReps - repCount;
    for (let i = 0; i < repsLeft; i++) {
      if (abortRef.current) break;
      await audioController.playAndWait(currentAyah.audioUrl);
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
          .map((w) => ({ position: w.position, text: w.textUthmani }))
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

    if (ayahIndex === 0 && surah.ayahs.length > 1) {
      // First ayah — skip chaining, go straight to next
      moveToNextAyah();
    } else if (ayahIndex < surah.ayahs.length - 1) {
      // Chain all completed ayahs before moving to next
      setMainStage('chaining');
      setChainAyahIndex(0);
      setChainRevealed(false);
    } else {
      // Last ayah — final chain of everything
      setMainStage('final-chain');
      setChainRevealed(false);
    }
  };

  const moveToNextAyah = () => {
    const next = ayahIndex + 1;
    setAyahIndex(next);
    updateChunkIndex(surah.id, next);
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
        await audioController.playAndWait(currentAyah.audioUrl);
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
    const chainAyahs = surah.ayahs.slice(0, ayahIndex + 1); // all learned so far
    const currentChainAyah = chainAyahs[chainAyahIndex];

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-foreground">Chain Together</h3>
          <p className="mt-1 text-sm text-muted">
            Recite ayahs 1–{ayahIndex + 1} in sequence from memory
          </p>
        </div>

        {/* Progress through chain */}
        <div className="flex justify-center gap-1.5">
          {chainAyahs.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                i < chainAyahIndex ? 'bg-success' :
                i === chainAyahIndex ? 'bg-teal' :
                'bg-foreground/10'
              )}
            />
          ))}
        </div>

        {!chainRevealed ? (
          <div className="space-y-5">
            <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-8 text-center">
              <p className="text-sm text-muted">Ayah {chainAyahIndex + 1}</p>
              <p className="mt-3 text-lg font-medium text-foreground">
                Recite this ayah from memory...
              </p>
            </div>
            <Button onClick={() => setChainRevealed(true)} className="w-full">
              Show Answer
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl bg-success/5 p-5 text-center">
              <ArabicText ayah={currentChainAyah} className="text-2xl leading-loose" />
            </div>

            {chainAyahIndex < chainAyahs.length - 1 ? (
              <Button
                onClick={() => {
                  setChainAyahIndex((i) => i + 1);
                  setChainRevealed(false);
                }}
                className="w-full"
              >
                Next Ayah in Chain
              </Button>
            ) : (
              <div className="flex gap-3">
                <Button
                  onClick={() => { setChainAyahIndex(0); setChainRevealed(false); }}
                  variant="secondary"
                  className="flex-1"
                >
                  Retry Chain
                </Button>
                <Button onClick={moveToNextAyah} className="flex-1">
                  Learn Next Ayah
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // RENDER: FINAL CHAIN (full surah from memory)
  // ============================================================

  if (mainStage === 'final-chain') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-foreground">Complete Recitation</h3>
          <p className="mt-1 text-sm text-muted">
            Recite the entire surah from start to finish.
          </p>
        </div>

        {!chainRevealed ? (
          <>
            <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-8 text-center">
              <p className="arabic-text text-2xl text-teal">{surah.nameArabic}</p>
              <p className="mt-2 text-lg font-semibold">{surah.nameSimple}</p>
              <p className="mt-4 text-sm text-muted">
                All {surah.versesCount} ayahs from memory
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
                <div key={ayah.key} className="rounded-xl bg-card p-4 shadow-sm text-center">
                  <ArabicText ayah={ayah} className="text-2xl leading-loose" />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setChainRevealed(false);
                  setAyahIndex(0);
                  setRepCount(0);
                  setMainStage('learning');
                  setLearnStep('listen-with-text');
                  setCompletedAyahs(new Set());
                }}
                variant="secondary"
                className="flex-1"
              >
                Start Over
              </Button>
              <Button
                onClick={() => { markChunkComplete(surah.id); onComplete(); }}
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

      {/* Ayah progress dots */}
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
          <div className="rounded-2xl bg-card p-6 text-center shadow-sm">
            <ArabicText ayah={currentAyah} className="text-4xl leading-loose" />
            <p className="mt-3 text-sm text-muted">
              {currentAyah.transliteration || actualWords.map((w) => w.transliteration).filter(Boolean).join(' ')}
            </p>
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
          <div className="flex justify-center gap-3">
            {isAutoPlaying ? (
              <button onClick={stopAutoPlay} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="4" y="4" width="12" height="12" rx="2" /></svg>
              </button>
            ) : (
              <>
                <button
                  onClick={playOnce}
                  disabled={repCount >= currentStepReps}
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
                <div className="rounded-xl bg-success/5 p-5 text-center">
                  <p className="arabic-text text-4xl leading-loose">
                    {actualWords.map((w) => w.textUthmani).join(' ')}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {currentAyah.transliteration || actualWords.map((w) => w.transliteration).filter(Boolean).join(' ')}
                  </p>
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
                    'arabic-text rounded-xl border-2 px-4 py-2 text-xl transition-all',
                    isUsed
                      ? 'border-transparent bg-foreground/5 text-foreground/20'
                      : 'border-foreground/10 bg-card hover:border-gold'
                  )}
                >
                  {word.text}
                </button>
              );
            })}
          </div>

          {orderResult === 'correct' && (
            <Button onClick={completeCurrentAyah} className="w-full">
              {ayahIndex === 0 && surah.ayahs.length > 1
                ? 'Learn Next Ayah'
                : ayahIndex < surah.ayahs.length - 1
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
