'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Surah, Chunk } from '@/types/quran';
import { generateChunks } from '@/lib/chunks';
import { useProgressStore } from '@/stores/progress-store';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ChunkPhaseProps {
  surah: Surah;
  onComplete: () => void;
}

type ChunkStage = 'show' | 'hide' | 'reveal' | 'order';

export default function ChunkPhase({ surah, onComplete }: ChunkPhaseProps) {
  const { markChunkComplete, updateChunkIndex } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[surah.id]);

  // Generate chunks for all ayahs
  const allChunks = useMemo(() => {
    return surah.ayahs.flatMap((ayah) => generateChunks(ayah.key, ayah.words));
  }, [surah]);

  const [currentIndex, setCurrentIndex] = useState(lesson?.phaseData.chunk.currentChunkIndex ?? 0);
  const [stage, setStage] = useState<ChunkStage>('show');
  const [completedChunks, setCompletedChunks] = useState<Set<number>>(new Set());

  // Word ordering state
  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
  const [orderCorrect, setOrderCorrect] = useState<boolean | null>(null);

  const currentChunk = allChunks[currentIndex];
  const isLastChunk = currentIndex >= allChunks.length - 1;

  const handleNext = useCallback(() => {
    setCompletedChunks((prev) => new Set([...prev, currentIndex]));

    if (isLastChunk) {
      markChunkComplete(surah.id);
      onComplete();
    } else {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      updateChunkIndex(surah.id, next);
      setStage('show');
      setSelectedOrder([]);
      setOrderCorrect(null);
    }
  }, [currentIndex, isLastChunk, markChunkComplete, updateChunkIndex, surah.id, onComplete]);

  const handleWordSelect = (position: number) => {
    if (orderCorrect !== null) return;

    const newOrder = [...selectedOrder, position];
    setSelectedOrder(newOrder);

    // Check if order is correct so far
    const correctOrder = currentChunk.words.map((w) => w.position);
    const isCorrectSoFar = newOrder.every((p, i) => p === correctOrder[i]);

    if (!isCorrectSoFar) {
      setOrderCorrect(false);
      setTimeout(() => {
        setSelectedOrder([]);
        setOrderCorrect(null);
      }, 800);
      return;
    }

    if (newOrder.length === correctOrder.length) {
      setOrderCorrect(true);
    }
  };

  if (!currentChunk) return null;

  // Shuffled words for ordering exercise
  const shuffledWords = useMemo(() => {
    return [...currentChunk.words].sort(() => Math.random() - 0.5);
  }, [currentChunk, stage === 'order' ? currentIndex : null]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Chunk & Build</h3>
        <p className="mt-1 text-sm text-muted">
          Build up the ayah piece by piece.
        </p>
        <p className="text-xs text-muted">
          Chunk {currentIndex + 1} of {allChunks.length}
        </p>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5">
        {allChunks.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-2 w-2 rounded-full',
              completedChunks.has(i) && 'bg-success',
              i === currentIndex && !completedChunks.has(i) && 'bg-teal',
              !completedChunks.has(i) && i !== currentIndex && 'bg-foreground/10'
            )}
          />
        ))}
      </div>

      {stage === 'show' && (
        <div className="space-y-6">
          {/* Show the chunk */}
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <div className="arabic-text flex flex-wrap justify-center gap-2 text-3xl">
              {currentChunk.words.map((word) => (
                <span key={word.position} className="text-teal">
                  {word.textUthmani}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">
              {currentChunk.words.map((w) => w.transliteration).filter(Boolean).join(' ')}
            </p>
            <p className="mt-1 text-sm italic text-muted">
              {currentChunk.words.map((w) => w.translation).filter(Boolean).join(' ')}
            </p>
          </div>

          <Button onClick={() => setStage('hide')} className="w-full">
            I've got it — test me
          </Button>
        </div>
      )}

      {stage === 'hide' && (
        <div className="space-y-6">
          {/* Hidden — recall from memory */}
          <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-8 text-center">
            <p className="text-lg text-muted">Can you recall the words?</p>
            <p className="mt-2 text-sm text-muted">Think of the Arabic text...</p>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => setStage('show')} variant="ghost" className="flex-1">
              Show again
            </Button>
            <Button onClick={() => setStage('reveal')} className="flex-1">
              Reveal
            </Button>
          </div>
        </div>
      )}

      {stage === 'reveal' && (
        <div className="space-y-6">
          {/* Revealed for confirmation */}
          <div className="rounded-2xl bg-success/5 p-6 text-center">
            <div className="arabic-text flex flex-wrap justify-center gap-2 text-3xl">
              {currentChunk.words.map((word) => (
                <span key={word.position}>{word.textUthmani}</span>
              ))}
            </div>
          </div>

          <Button onClick={() => setStage('order')} className="w-full">
            Now put it in order
          </Button>
        </div>
      )}

      {stage === 'order' && (
        <div className="space-y-6">
          {/* Word ordering exercise */}
          <div className="text-center text-sm text-muted">
            Tap the words in the correct order (right to left)
          </div>

          {/* Selected words */}
          <div className="flex min-h-[60px] flex-wrap justify-center gap-2 rounded-xl border-2 border-dashed border-foreground/20 p-3" dir="rtl">
            {selectedOrder.map((pos, i) => {
              const word = currentChunk.words.find((w) => w.position === pos);
              return (
                <span
                  key={i}
                  className={cn(
                    'arabic-text rounded-lg px-3 py-1.5 text-xl',
                    orderCorrect === false ? 'bg-red-100 text-red-600' :
                    orderCorrect === true ? 'bg-success/10 text-success' :
                    'bg-teal/10 text-teal'
                  )}
                >
                  {word?.textUthmani}
                </span>
              );
            })}
          </div>

          {/* Available words */}
          <div className="flex flex-wrap justify-center gap-2" dir="rtl">
            {shuffledWords.map((word) => {
              const isUsed = selectedOrder.includes(word.position);
              return (
                <button
                  key={word.position}
                  onClick={() => handleWordSelect(word.position)}
                  disabled={isUsed || orderCorrect !== null}
                  className={cn(
                    'arabic-text rounded-xl border-2 px-4 py-2 text-xl transition-all',
                    isUsed
                      ? 'border-transparent bg-foreground/5 text-foreground/20'
                      : 'border-foreground/10 bg-white hover:border-gold'
                  )}
                >
                  {word.textUthmani}
                </button>
              );
            })}
          </div>

          {orderCorrect === true && (
            <Button onClick={handleNext} className="w-full">
              {isLastChunk ? 'Complete' : 'Next Chunk'}
            </Button>
          )}

          {orderCorrect === false && (
            <p className="text-center text-sm text-red-500">
              Not quite — try again!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
