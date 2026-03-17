'use client';

import { useState, useMemo } from 'react';
import type { Surah, TestLevel } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
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
          {level === 'fill-blank' && 'Level 1: Fill in the missing word'}
          {level === 'first-letter' && 'Level 2: Recall from letter hints'}
          {level === 'full-recall' && 'Level 3: Full recall from memory'}
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
        <FillBlankTest surah={surah} onPass={() => setLevelPassed(true)} onFail={onRetry} />
      )}

      {level === 'first-letter' && (
        <FirstLetterTest surah={surah} onPass={() => setLevelPassed(true)} onFail={onRetry} />
      )}

      {level === 'full-recall' && (
        <FullRecallTest surah={surah} onPass={() => setLevelPassed(true)} onFail={onRetry} />
      )}

      {levelPassed && (
        <Button onClick={advanceLevel} className="w-full">
          {level === 'full-recall' ? 'Complete Lesson' : 'Next Level'}
        </Button>
      )}
    </div>
  );
}

// === Fill in the Blank (no transliteration shown) ===

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

  const blankIndex = useMemo(
    () => Math.floor(Math.random() * words.length),
    [ayahIndex]
  );
  const blankWord = words[blankIndex];

  // Generate options from other words across the surah
  const options = useMemo(() => {
    const allWords = surah.ayahs
      .flatMap((a) => a.words)
      .filter((w) => w.charType === 'word' && w.textUthmani !== blankWord.textUthmani);
    const shuffled = allWords.sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [...shuffled.map((w) => w.textUthmani), blankWord.textUthmani];
    return opts.sort(() => Math.random() - 0.5);
  }, [ayahIndex, blankWord.textUthmani, surah.ayahs]);

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
      {/* Ayah with blank — NO transliteration */}
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <div className="arabic-text flex flex-wrap justify-center gap-x-3 gap-y-1 text-2xl leading-loose">
          {words.map((word) => (
            <span
              key={word.position}
              className={cn(
                'inline-block rounded px-1.5 py-0.5',
                word.position === blankWord.position
                  ? 'bg-foreground/10 text-transparent select-none min-w-[60px] text-center'
                  : ''
              )}
            >
              {word.position === blankWord.position ? '____' : word.textUthmani}
            </span>
          ))}
        </div>
      </div>

      {/* Options — Arabic only, no transliteration */}
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

      <p className="text-center text-xs text-muted">
        Ayah {ayahIndex + 1} of {surah.ayahs.length} &middot; Score: {score}
      </p>
    </div>
  );
}

// === First Letter Hints (show 2-3 meaningful letters per word) ===

function getLetterHint(arabicWord: string): string {
  // Skip common prefixes: و (wa), ب (bi), ل (li), ف (fa), ال (al-)
  const prefixes = ['وَ', 'بِ', 'لِ', 'فَ'];
  let word = arabicWord;
  let prefix = '';

  for (const p of prefixes) {
    if (word.startsWith(p) && word.length > p.length + 2) {
      prefix = p;
      word = word.slice(p.length);
      break;
    }
  }

  // Handle ال (alif-lam) article
  if (word.startsWith('ٱل') || word.startsWith('ال')) {
    prefix += word.slice(0, 2);
    word = word.slice(2);
  }

  // Show prefix + first 2 chars of root, then dots
  const hintChars = word.slice(0, 2);
  const remainder = word.length > 2 ? '...' : '';
  return prefix + hintChars + remainder;
}

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
  const [results, setResults] = useState<boolean[]>([]);

  const ayah = surah.ayahs[ayahIndex];
  const words = ayah.words.filter((w) => w.charType === 'word');
  const hints = words.map((w) => getLetterHint(w.textUthmani));

  const handleRate = (gotIt: boolean) => {
    const newResults = [...results, gotIt];
    setResults(newResults);

    if (ayahIndex < surah.ayahs.length - 1) {
      setAyahIndex((i) => i + 1);
      setRevealed(false);
    } else {
      const passCount = newResults.filter(Boolean).length;
      if (passCount >= Math.ceil(surah.ayahs.length * 0.5)) {
        onPass();
      } else {
        onFail();
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card p-6 text-center shadow-sm">
        <p className="text-xs text-muted mb-3">
          Ayah {ayahIndex + 1} of {surah.ayahs.length}
        </p>
        <div className="arabic-text flex flex-wrap justify-center gap-x-4 gap-y-1 text-2xl leading-loose" dir="rtl">
          {hints.map((hint, i) => (
            <span key={i} className="text-teal/70">{hint}</span>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          Try to recite the full ayah aloud from these hints
        </p>
      </div>

      {!revealed ? (
        <Button onClick={() => setRevealed(true)} className="w-full">
          Show Answer
        </Button>
      ) : (
        <>
          <div className="rounded-xl bg-success/5 p-5">
            <p className="arabic-text text-center text-2xl leading-loose">
              {ayah.textUthmani}
            </p>
          </div>
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

// === Full Recall (with timer feel, 3-option rating) ===

function FullRecallTest({
  surah,
  onPass,
  onFail,
}: {
  surah: Surah;
  onPass: () => void;
  onFail: () => void;
}) {
  const [started, setStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-6">
      {!started ? (
        <>
          <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-10 text-center">
            <p className="arabic-text text-3xl text-teal">{surah.nameArabic}</p>
            <p className="mt-2 text-lg font-semibold">{surah.nameSimple}</p>
            <p className="mt-4 text-sm text-muted">
              Recite the entire surah from memory
            </p>
          </div>
          <Button onClick={() => setStarted(true)} className="w-full">
            Begin Recitation
          </Button>
        </>
      ) : !revealed ? (
        <>
          <div className="rounded-2xl bg-teal/5 p-10 text-center">
            <p className="text-lg font-medium text-teal">Reciting...</p>
            <p className="mt-2 text-sm text-muted">
              Take your time. Recite the full surah aloud.
            </p>
            <p className="mt-4 arabic-text text-xl text-muted/50">{surah.nameArabic}</p>
          </div>
          <Button onClick={() => setRevealed(true)} className="w-full">
            Show Full Surah
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-3">
            {surah.ayahs.map((ayah) => (
              <div key={ayah.key} className="rounded-xl bg-card p-4 shadow-sm">
                <p className="arabic-text text-center text-2xl leading-loose">
                  {ayah.textUthmani}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-center text-sm font-medium">How did you do?</p>
            <div className="flex gap-2">
              <button
                onClick={onFail}
                className="flex-1 rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
              >
                Forgot
              </button>
              <button
                onClick={onPass}
                className="flex-1 rounded-xl bg-amber-50 py-3 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-100"
              >
                Hard but Got It
              </button>
              <button
                onClick={onPass}
                className="flex-1 rounded-xl bg-green-50 py-3 text-sm font-semibold text-green-600 transition-colors hover:bg-green-100"
              >
                Easy
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
