'use client';

import { useState, useMemo } from 'react';
import type { Surah, TestLevel, Word } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface TestPhaseProps {
  surah: Surah;
  onComplete: () => void;
  onRetry: () => void;
}

export default function TestPhase({ surah, onComplete, onRetry }: TestPhaseProps) {
  const { updateTestLevel, markTestComplete } = useProgressStore();
  const [level, setLevel] = useState<TestLevel>('fill-blank');
  const [levelPassed, setLevelPassed] = useState(false);

  const advanceLevel = () => {
    setLevelPassed(false);
    if (level === 'fill-blank') {
      setLevel('first-letter');
      updateTestLevel(surah.id, 'first-letter');
    } else if (level === 'first-letter') {
      setLevel('full-recall');
      updateTestLevel(surah.id, 'full-recall');
    } else {
      markTestComplete(surah.id);
      onComplete();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Test Your Memory</h3>
        <p className="mt-1 text-sm text-muted">
          {level === 'fill-blank' && 'Level 1: Fill in the blanks'}
          {level === 'first-letter' && 'Level 2: First letter hints'}
          {level === 'full-recall' && 'Level 3: Full recall'}
        </p>
      </div>

      {/* Level indicator */}
      <div className="flex justify-center gap-2">
        {(['fill-blank', 'first-letter', 'full-recall'] as TestLevel[]).map((l, i) => (
          <div
            key={l}
            className={cn(
              'h-2 flex-1 rounded-full max-w-16',
              l === level ? 'bg-teal' :
              i < ['fill-blank', 'first-letter', 'full-recall'].indexOf(level) ? 'bg-success' :
              'bg-foreground/10'
            )}
          />
        ))}
      </div>

      {level === 'fill-blank' && (
        <FillBlankTest
          surah={surah}
          onPass={() => setLevelPassed(true)}
          onFail={onRetry}
        />
      )}

      {level === 'first-letter' && (
        <FirstLetterTest
          surah={surah}
          onPass={() => setLevelPassed(true)}
          onFail={onRetry}
        />
      )}

      {level === 'full-recall' && (
        <FullRecallTest
          surah={surah}
          onPass={() => setLevelPassed(true)}
          onFail={onRetry}
        />
      )}

      {levelPassed && (
        <Button onClick={advanceLevel} className="w-full">
          {level === 'full-recall' ? 'Complete Lesson' : 'Next Level'}
        </Button>
      )}
    </div>
  );
}

// --- Fill in the Blank ---

function FillBlankTest({
  surah,
  onPass,
  onFail,
}: {
  surah: Surah;
  onPass: () => void;
  onFail: () => void;
}) {
  const [ayahIndex, setAyahIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  const ayah = surah.ayahs[ayahIndex];
  const words = ayah.words.filter((w) => w.charType === 'word');

  // Pick a random word to blank
  const blankIndex = useMemo(
    () => Math.floor(Math.random() * words.length),
    [ayahIndex]
  );
  const blankWord = words[blankIndex];
  const blankPositions = [blankWord.position];

  // Generate options
  const options = useMemo(() => {
    const allWords = surah.ayahs
      .flatMap((a) => a.words)
      .filter((w) => w.charType === 'word' && w.textUthmani !== blankWord.textUthmani);
    const shuffled = allWords.sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [...shuffled.map((w) => w.textUthmani), blankWord.textUthmani];
    return opts.sort(() => Math.random() - 0.5);
  }, [ayahIndex]);

  const handleSelect = (word: string) => {
    if (answered) return;
    setSelectedWord(word);
    setAnswered(true);

    const correct = word === blankWord.textUthmani;
    if (correct) setScore((s) => s + 1);

    setTimeout(() => {
      if (ayahIndex < surah.ayahs.length - 1) {
        setAyahIndex((i) => i + 1);
        setAnswered(false);
        setSelectedWord(null);
      } else {
        const totalCorrect = score + (correct ? 1 : 0);
        if (totalCorrect >= Math.ceil(surah.ayahs.length * 0.5)) {
          onPass();
        } else {
          onFail();
        }
      }
    }, 1200);
  };

  return (
    <div className="space-y-6">
      <AyahDisplay ayah={ayah} blankWords={blankPositions} showTranslation={false} />

      <div className="grid grid-cols-2 gap-2" dir="rtl">
        {options.map((opt, i) => {
          const isCorrect = opt === blankWord.textUthmani;
          const isSelected = opt === selectedWord;
          return (
            <button
              key={i}
              onClick={() => handleSelect(opt)}
              disabled={answered}
              className={cn(
                'arabic-text rounded-xl border-2 px-3 py-3 text-xl transition-all',
                !answered && 'border-foreground/10 hover:border-teal',
                answered && isCorrect && 'border-success bg-success/10',
                answered && isSelected && !isCorrect && 'border-red-500 bg-red-50'
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- First Letter Test ---

function FirstLetterTest({
  surah,
  onPass,
  onFail,
}: {
  surah: Surah;
  onPass: () => void;
  onFail: () => void;
}) {
  const [ayahIndex, setAyahIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const ayah = surah.ayahs[ayahIndex];
  const words = ayah.words.filter((w) => w.charType === 'word');

  const firstLetterHints = words
    .map((w) => w.textUthmani.charAt(0) + '...')
    .join('  ');

  const handleRate = (gotIt: boolean) => {
    if (ayahIndex < surah.ayahs.length - 1) {
      setAyahIndex((i) => i + 1);
      setRevealed(false);
    } else {
      if (gotIt) onPass();
      else onFail();
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="arabic-text text-2xl leading-loose text-muted" dir="rtl">
          {firstLetterHints}
        </p>
        <p className="mt-2 text-xs text-muted">
          Ayah {ayahIndex + 1} of {surah.ayahs.length} — Try to recite the full ayah
        </p>
      </div>

      {!revealed ? (
        <Button onClick={() => setRevealed(true)} className="w-full">
          Show Answer
        </Button>
      ) : (
        <>
          <AyahDisplay ayah={ayah} />
          <div className="flex gap-3">
            <Button onClick={() => handleRate(false)} variant="secondary" className="flex-1">
              Need Practice
            </Button>
            <Button onClick={() => handleRate(true)} className="flex-1">
              Got It
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Full Recall Test ---

function FullRecallTest({
  surah,
  onPass,
  onFail,
}: {
  surah: Surah;
  onPass: () => void;
  onFail: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-6">
      {!revealed ? (
        <>
          <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-12 text-center">
            <p className="arabic-text text-2xl text-teal">{surah.nameArabic}</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {surah.nameSimple}
            </p>
            <p className="mt-4 text-sm text-muted">
              Recite the entire surah from memory
            </p>
          </div>

          <Button onClick={() => setRevealed(true)} className="w-full">
            Show Full Surah
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-4">
            {surah.ayahs.map((ayah) => (
              <AyahDisplay key={ayah.key} ayah={ayah} />
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-center text-sm font-medium text-foreground">
              How did you do?
            </p>
            <div className="flex gap-3">
              <Button onClick={onFail} variant="secondary" className="flex-1">
                Need More Practice
              </Button>
              <Button onClick={onPass} className="flex-1">
                I Got It
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
