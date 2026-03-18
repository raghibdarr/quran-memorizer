'use client';

import { useState, useMemo } from 'react';
import type { Surah, Ayah, TestLevel } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import ArabicText from '@/components/ui/arabic-text';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { audioController } from '@/lib/audio';
import { getAudioUrl as buildAudioUrl } from '@/lib/quran-data';
import { useSettingsStore } from '@/stores/settings-store';

interface TestPhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonId: string;
  totalLessons: number;
  onComplete: () => void;
  onRetry: () => void;
}

export default function TestPhase({ surah, ayahs, lessonId, totalLessons, onComplete, onRetry }: TestPhaseProps) {
  const { updateTestLevel, markTestComplete } = useProgressStore();
  const [level, setLevel] = useState<TestLevel>('fill-blank');
  const [levelPassed, setLevelPassed] = useState(false);
  const [resultScreen, setResultScreen] = useState<{
    type: 'pass' | 'fail';
    score: number;
    total: number;
    mistakes: number[];  // ayah indices that were wrong
  } | null>(null);

  const advanceLevel = () => {
    setLevelPassed(false);
    setResultScreen(null);
    if (level === 'fill-blank') {
      setLevel('first-letter');
      updateTestLevel(lessonId, 'first-letter');
    } else if (level === 'first-letter') {
      setLevel('full-recall');
      updateTestLevel(lessonId, 'full-recall');
    } else {
      markTestComplete(lessonId);
      onComplete();
    }
  };

  const handleResult = (score: number, total: number, mistakes: number[]) => {
    const passed = score >= Math.ceil(total * 0.5);
    setResultScreen({ type: passed ? 'pass' : 'fail', score, total, mistakes });
    if (passed) setLevelPassed(true);
  };

  const lessonLabel = totalLessons > 1
    ? `${surah.nameSimple} — Lesson ${lessonId.split('-')[1]}`
    : surah.nameSimple;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Test Your Memory</h3>
        <p className="mt-1 text-sm text-muted">
          {level === 'fill-blank' && 'Level 1: Fill in the missing word'}
          {level === 'first-letter' && 'Level 2: Recall from letter hints'}
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

      {/* Result screen (pass or fail) */}
      {resultScreen ? (
        <div className="space-y-5 py-4">
          <div className="text-center">
            <div className={cn(
              'mx-auto flex h-16 w-16 items-center justify-center rounded-full',
              resultScreen.type === 'pass' ? 'bg-success/10' : 'bg-red-500/10'
            )}>
              {resultScreen.type === 'pass' ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2D7A4F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              )}
            </div>

            <h3 className="mt-3 text-lg font-bold text-foreground">
              {resultScreen.type === 'fail'
                ? 'Not quite there yet'
                : resultScreen.score === resultScreen.total
                ? 'Flawless!'
                : resultScreen.score >= resultScreen.total - 1
                ? 'Almost perfect!'
                : 'Passed!'}
            </h3>

            <p className="mt-1 text-2xl font-bold text-foreground">
              {resultScreen.score} / {resultScreen.total}
            </p>

            <p className="mt-1 text-sm text-muted">
              {resultScreen.type === 'fail'
                ? 'Go back and practice the ayahs you struggled with, then try again.'
                : resultScreen.mistakes.length > 0
                ? `You got ${resultScreen.mistakes.length} wrong — review them below.`
                : 'No mistakes — well done!'}
            </p>
          </div>

          {/* Show mistakes */}
          {resultScreen.mistakes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted">Mistakes:</p>
              {resultScreen.mistakes.map((idx) => (
                <div key={idx} className="rounded-xl bg-red-500/5 border border-red-500/10 p-3">
                  <AyahDisplay ayah={ayahs[idx]} />
                </div>
              ))}
            </div>
          )}

          {resultScreen.type === 'pass' ? (
            <Button onClick={advanceLevel} className="w-full">
              {level === 'full-recall' ? 'Complete Lesson' : 'Next Level'}
            </Button>
          ) : (
            <Button onClick={onRetry} className="w-full">
              Review & Practice
            </Button>
          )}
        </div>
      ) : (
        <>
          {level === 'fill-blank' && (
            <FillBlankTest ayahs={ayahs} onResult={handleResult} />
          )}
          {level === 'first-letter' && (
            <FirstLetterTest ayahs={ayahs} onResult={handleResult} />
          )}
          {level === 'full-recall' && (
            <FullRecallTest
              surah={surah}
              ayahs={ayahs}
              lessonLabel={lessonLabel}
              totalLessons={totalLessons}
              onResult={handleResult}
            />
          )}
        </>
      )}
    </div>
  );
}

// === Fill in the Blank ===

function FillBlankTest({
  ayahs,
  onResult,
}: {
  ayahs: Ayah[];
  onResult: (score: number, total: number, mistakes: number[]) => void;
}) {
  const [ayahIndex, setAyahIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState<number[]>([]);
  const [answered, setAnswered] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  const ayah = ayahs[ayahIndex];
  const words = ayah.words.filter((w) => w.charType === 'word');

  const blankIndex = useMemo(
    () => Math.floor(Math.random() * words.length),
    [ayahIndex]
  );
  const blankWord = words[blankIndex];

  const optionWords = useMemo(() => {
    const allWords = ayahs.flatMap((a) => a.words).filter((w) => w.charType === 'word');
    const others = allWords
      .filter((w) => w.textUthmani !== blankWord.textUthmani)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const opts = [...others.map((w) => ({ text: w.textUthmani, transliteration: w.transliteration })),
      { text: blankWord.textUthmani, transliteration: blankWord.transliteration }]
      .sort(() => Math.random() - 0.5);
    return opts;
  }, [ayahIndex, blankWord.textUthmani, ayahs]);

  const handleSelect = (word: string) => {
    if (answered) return;
    setSelectedWord(word);
    setAnswered(true);

    const correct = word === blankWord.textUthmani;
    const newScore = correct ? score + 1 : score;
    const newMistakes = correct ? mistakes : [...mistakes, ayahIndex];
    if (correct) setScore(newScore);
    else setMistakes(newMistakes);

    setTimeout(() => {
      if (ayahIndex < ayahs.length - 1) {
        setAyahIndex((i) => i + 1);
        setAnswered(false);
        setSelectedWord(null);
      } else {
        onResult(newScore, ayahs.length, newMistakes);
      }
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Ayah with blank — word-level transliteration, hidden for blanked word */}
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <div className="arabic-text flex flex-wrap justify-center gap-x-3 gap-y-2 text-2xl leading-loose">
          {words.map((word) => {
            const isBlanked = word.position === blankWord.position;
            return (
              <div key={word.position} className="flex flex-col items-center">
                <span
                  className={cn(
                    'inline-block rounded px-1.5 py-0.5',
                    isBlanked && 'bg-foreground/10 text-transparent select-none min-w-[60px] text-center'
                  )}
                >
                  {isBlanked ? '____' : word.textUthmani}
                </span>
                {!isBlanked && word.transliteration && (
                  <span className="text-[10px] text-muted mt-0.5" dir="ltr" style={{ fontFamily: 'var(--font-sans)' }}>
                    {word.transliteration}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Options with transliteration */}
      <div className="grid grid-cols-2 gap-2" dir="rtl">
        {optionWords.map((opt, i) => {
          const isCorrect = opt.text === blankWord.textUthmani;
          const isSelected = opt.text === selectedWord;
          return (
            <button
              key={i}
              onClick={() => handleSelect(opt.text)}
              disabled={answered}
              className={cn(
                'flex flex-col items-center rounded-xl border-2 px-3 py-3 transition-all',
                !answered && 'border-foreground/10 hover:border-teal',
                answered && isCorrect && 'border-success bg-success/10 text-success',
                answered && isSelected && !isCorrect && 'border-red-500 bg-red-500/10'
              )}
            >
              <span className="arabic-text text-xl">{opt.text}</span>
              {opt.transliteration && (
                <span className="text-[10px] text-muted mt-0.5" dir="ltr">{opt.transliteration}</span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted">
        Ayah {ayahIndex + 1} of {ayahs.length} &middot; Score: {score}
      </p>
    </div>
  );
}

// === First Letter Hints ===

function getLetterHint(arabicWord: string): string {
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
  if (word.startsWith('ٱل') || word.startsWith('ال')) {
    prefix += word.slice(0, 2);
    word = word.slice(2);
  }
  const hintChars = word.slice(0, 2);
  const remainder = word.length > 2 ? '...' : '';
  return prefix + hintChars + remainder;
}

function FirstLetterTest({
  ayahs,
  onResult,
}: {
  ayahs: Ayah[];
  onResult: (score: number, total: number, mistakes: number[]) => void;
}) {
  const [ayahIndex, setAyahIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState<number[]>([]);

  const ayah = ayahs[ayahIndex];
  const words = ayah.words.filter((w) => w.charType === 'word');
  const hints = words.map((w) => getLetterHint(w.textUthmani));

  const handleRate = (gotIt: boolean) => {
    const newScore = gotIt ? score + 1 : score;
    const newMistakes = gotIt ? mistakes : [...mistakes, ayahIndex];
    if (gotIt) setScore(newScore);
    else setMistakes(newMistakes);

    if (ayahIndex < ayahs.length - 1) {
      setAyahIndex((i) => i + 1);
      setRevealed(false);
    } else {
      onResult(newScore, ayahs.length, newMistakes);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card p-6 text-center shadow-sm">
        <p className="text-xs text-muted mb-3">
          Ayah {ayahIndex + 1} of {ayahs.length}
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
            <AyahDisplay ayah={ayah} />
          </div>
          <p className="text-center text-sm text-muted">Did you recite it correctly?</p>
          <div className="flex gap-3">
            <Button onClick={() => handleRate(false)} variant="secondary" className="flex-1">
              Not quite
            </Button>
            <Button onClick={() => handleRate(true)} className="flex-1">
              Got it
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// === Full Recall ===

function FullRecallTest({
  surah,
  ayahs,
  lessonLabel,
  totalLessons,
  onResult,
}: {
  surah: Surah;
  ayahs: Ayah[];
  lessonLabel: string;
  totalLessons: number;
  onResult: (score: number, total: number, mistakes: number[]) => void;
}) {
  const [started, setStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const getAudioUrl = (surahId: number, ayahNum: number) =>
    buildAudioUrl(surahId, ayahNum, useSettingsStore.getState().reciter);

  const playAyah = async (ayah: Ayah) => {
    await audioController.play(getAudioUrl(surah.id, ayah.number));
  };

  return (
    <div className="space-y-6">
      {!started ? (
        <>
          <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-10 text-center">
            <p className="arabic-text text-3xl text-teal">{surah.nameArabic}</p>
            <p className="mt-2 text-lg font-semibold">{lessonLabel}</p>
            <p className="mt-4 text-sm text-muted">
              Recite all {ayahs.length} ayahs from memory
            </p>
          </div>
          <Button onClick={() => setStarted(true)} className="w-full">
            Begin Recitation
          </Button>
        </>
      ) : !revealed ? (
        <>
          <div className="rounded-2xl bg-teal/5 p-10 text-center">
            <p className="text-lg font-medium text-teal">Recite now</p>
            <p className="mt-2 text-sm text-muted">
              Take your time. Recite aloud, then reveal to check.
            </p>
            <p className="mt-4 arabic-text text-xl text-muted/50">{surah.nameArabic}</p>
          </div>
          <Button onClick={() => setRevealed(true)} className="w-full">
            Reveal & Check
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-3">
            {ayahs.map((ayah) => (
              <div key={ayah.key} className="rounded-xl bg-card p-4 shadow-sm relative">
                <button
                  onClick={() => playAyah(ayah)}
                  className="absolute top-3 left-3 text-muted hover:text-teal transition-colors"
                  title="Play ayah"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z" /></svg>
                </button>
                <AyahDisplay ayah={ayah} />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-center text-sm font-medium">How did you do?</p>
            <div className="flex gap-2">
              <button
                onClick={() => onResult(0, 1, [0])}
                className="flex-1 rounded-xl bg-red-500/10 py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/20"
              >
                Forgot
              </button>
              <button
                onClick={() => onResult(1, 1, [])}
                className="flex-1 rounded-xl bg-amber-500/10 py-3 text-sm font-semibold text-amber-500 transition-colors hover:bg-amber-500/20"
              >
                Struggled
              </button>
              <button
                onClick={() => onResult(1, 1, [])}
                className="flex-1 rounded-xl bg-green-500/10 py-3 text-sm font-semibold text-green-500 transition-colors hover:bg-green-500/20"
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
