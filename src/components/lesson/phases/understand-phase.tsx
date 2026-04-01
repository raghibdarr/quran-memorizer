'use client';

import { useState, useEffect } from 'react';
import type { Surah, Ayah, Word } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { audioController } from '@/lib/audio';
import ArabicText from '@/components/ui/arabic-text';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface UnderstandPhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonId: string;
  onComplete: () => void;
}

export default function UnderstandPhase({ surah, ayahs, lessonId, onComplete }: UnderstandPhaseProps) {
  const lesson = useProgressStore((s) => s.lessons[lessonId]);
  const savedExplored = lesson?.phaseData.understand.exploredAyahs;
  const [ayahIndex, setAyahIndex] = useState(0);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [revealedTranslations, setRevealedTranslations] = useState<Set<number>>(new Set());
  const [exploredAyahs, setExploredAyahs] = useState<Set<number>>(
    savedExplored ? new Set(savedExplored) : new Set([0])
  );
  const { markUnderstandComplete, updateExploredAyahs } = useProgressStore();

  // Persist explored ayahs
  useEffect(() => {
    updateExploredAyahs(lessonId, [...exploredAyahs]);
  }, [exploredAyahs, lessonId, updateExploredAyahs]);

  const currentAyah = ayahs[ayahIndex];
  const allExplored = exploredAyahs.size >= ayahs.length;

  const handleWordClick = async (word: Word) => {
    setSelectedWord(word);
    if (word.audioUrl) {
      await audioController.play(word.audioUrl);
    }
  };

  const goToAyah = (index: number) => {
    setAyahIndex(index);
    setSelectedWord(null);
    setExploredAyahs((prev) => new Set([...prev, index]));
  };

  const handleContinue = () => {
    markUnderstandComplete(lessonId);
    onComplete();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Understand</h3>
        <p className="mt-1 text-sm text-muted">
          Explore each word to understand what you're memorizing.
        </p>
      </div>

      {/* Ayah navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => goToAyah(ayahIndex - 1)}
          disabled={ayahIndex === 0}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Prev
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {ayahs.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-2 w-2 rounded-full transition-all',
                i === ayahIndex ? 'bg-teal scale-125' :
                exploredAyahs.has(i) ? 'bg-success' :
                'bg-foreground/15'
              )}
            />
          ))}
        </div>

        <button
          onClick={() => goToAyah(ayahIndex + 1)}
          disabled={ayahIndex === ayahs.length - 1}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-teal transition-colors hover:text-teal-light disabled:opacity-0"
        >
          Next
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      <p className="text-center text-xs text-muted">
        Ayah {ayahIndex + 1} of {ayahs.length}
      </p>

      {/* Full ayah in Arabic */}
      <div className="rounded-xl bg-card p-4 shadow-sm text-center">
        <ArabicText ayah={currentAyah} className="text-3xl leading-loose" />
        {currentAyah.transliteration && (
          <p className="mt-2 text-center text-sm text-muted">
            {currentAyah.transliteration}
          </p>
        )}
        {currentAyah.translation && (
          revealedTranslations.has(ayahIndex) ? (
            <p className="mt-1 text-center text-sm italic text-muted">
              {currentAyah.translation}
            </p>
          ) : (
            <button
              onClick={() => setRevealedTranslations((prev) => new Set([...prev, ayahIndex]))}
              className="mt-2 text-xs font-medium text-teal hover:text-teal-light transition-colors"
            >
              Tap to see translation
            </button>
          )
        )}
      </div>

      {/* Word-by-word breakdown */}
      <div>
        <p className="mb-2 text-center text-xs text-muted">
          Tap a word to hear it and see its meaning
        </p>
        <div className="flex flex-wrap justify-center gap-2" dir="rtl">
          {currentAyah.words
            .filter((w) => w.charType === 'word')
            .map((word) => {
              const isSelected = selectedWord?.position === word.position;
              return (
                <button
                  key={`${currentAyah.key}-${word.position}`}
                  onClick={() => handleWordClick(word)}
                  className={cn(
                    'flex flex-col items-center rounded-xl border-2 px-3 py-2.5 transition-all',
                    isSelected
                      ? 'border-gold bg-gold/10 shadow-md'
                      : 'border-foreground/10 bg-card hover:border-gold/50'
                  )}
                >
                  <span className="arabic-text text-xl leading-normal">{word.textUthmani}</span>
                  {word.transliteration && (
                    <span className="mt-0.5 text-[10px] text-muted" dir="ltr">
                      {word.transliteration}
                    </span>
                  )}
                  {isSelected && word.translation && (
                    <span className="mt-1 text-xs font-semibold text-teal" dir="ltr">
                      {word.translation}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      {/* Selected word detail */}
      {selectedWord && (
        <div className="rounded-xl bg-teal/5 p-4 text-center">
          <p className="arabic-text text-3xl">{selectedWord.textUthmani}</p>
          {selectedWord.transliteration && (
            <p className="mt-1 text-sm text-muted">{selectedWord.transliteration}</p>
          )}
          {selectedWord.translation && (
            <p className="mt-1 text-sm font-semibold text-teal">{selectedWord.translation}</p>
          )}
        </div>
      )}

      <Button
        onClick={handleContinue}
        disabled={!allExplored}
        className="w-full"
      >
        {allExplored
          ? 'Continue to Build'
          : `Explore all ayahs (${exploredAyahs.size}/${ayahs.length})`}
      </Button>

      {!allExplored && (
        <button
          onClick={handleContinue}
          className="mx-auto block text-xs text-muted hover:text-foreground transition-colors"
        >
          Already know the meanings? Skip to Build →
        </button>
      )}
    </div>
  );
}
