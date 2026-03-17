'use client';

import { useState } from 'react';
import type { Surah, Word } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { audioController } from '@/lib/audio';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface UnderstandPhaseProps {
  surah: Surah;
  onComplete: () => void;
}

export default function UnderstandPhase({ surah, onComplete }: UnderstandPhaseProps) {
  const [ayahIndex, setAyahIndex] = useState(0);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [exploredAyahs, setExploredAyahs] = useState<Set<number>>(new Set([0]));
  const { markUnderstandComplete } = useProgressStore();

  const currentAyah = surah.ayahs[ayahIndex];
  const allExplored = exploredAyahs.size >= surah.ayahs.length;

  const handleWordClick = async (word: Word) => {
    setSelectedWord(word);
    // Play ayah audio since word-level audio isn't available from the API
    await audioController.play(currentAyah.audioUrl);
  };

  const goToAyah = (index: number) => {
    setAyahIndex(index);
    setSelectedWord(null);
    setExploredAyahs((prev) => new Set([...prev, index]));
  };

  const handleContinue = () => {
    markUnderstandComplete(surah.id);
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

      {/* Ayah navigation tabs */}
      <div className="flex justify-center gap-2">
        {surah.ayahs.map((_, i) => (
          <button
            key={i}
            onClick={() => goToAyah(i)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all',
              i === ayahIndex
                ? 'bg-teal text-white'
                : exploredAyahs.has(i)
                ? 'bg-success/10 text-success'
                : 'bg-foreground/10 text-muted hover:bg-foreground/20'
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Full ayah in Arabic */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="arabic-text text-center text-2xl leading-loose">
          {currentAyah.textUthmani}
        </p>
        {currentAyah.translation && (
          <p className="mt-2 text-center text-sm italic text-muted">
            {currentAyah.translation}
          </p>
        )}
      </div>

      {/* Word-by-word breakdown */}
      <div>
        <p className="mb-2 text-center text-xs text-muted">
          Tap a word to see its meaning and hear the ayah
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
                      : 'border-foreground/10 bg-white hover:border-gold/50'
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
          : `Explore all ayahs (${exploredAyahs.size}/${surah.ayahs.length})`}
      </Button>
    </div>
  );
}
