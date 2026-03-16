'use client';

import { useState, useMemo } from 'react';
import type { Surah, Word } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { useAudio } from '@/hooks/use-audio';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface UnderstandPhaseProps {
  surah: Surah;
  onComplete: () => void;
}

interface QuizQuestion {
  word: Word;
  options: string[];
  correctIndex: number;
}

export default function UnderstandPhase({ surah, onComplete }: UnderstandPhaseProps) {
  const [mode, setMode] = useState<'explore' | 'quiz'>('explore');
  const [exploredAyahIndex, setExploredAyahIndex] = useState(0);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const { play } = useAudio();
  const { markUnderstandComplete } = useProgressStore();

  // Quiz state
  const [quizIndex, setQuizIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [quizDone, setQuizDone] = useState(false);

  // Get all words for quiz
  const allWords = useMemo(() => {
    return surah.ayahs
      .flatMap((a) => a.words)
      .filter((w) => w.charType === 'word' && w.translation);
  }, [surah]);

  // Generate quiz questions
  const questions = useMemo((): QuizQuestion[] => {
    const shuffled = [...allWords].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(5, allWords.length));

    return selected.map((word) => {
      const otherTranslations = allWords
        .filter((w) => w.translation !== word.translation)
        .map((w) => w.translation!)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      const options = [word.translation!, ...otherTranslations].sort(
        () => Math.random() - 0.5
      );

      return {
        word,
        options,
        correctIndex: options.indexOf(word.translation!),
      };
    });
  }, [allWords]);

  const currentAyah = surah.ayahs[exploredAyahIndex];
  const currentQuestion = questions[quizIndex];

  const handleWordClick = async (word: Word) => {
    setSelectedWord(word);
    if (word.audioUrl) {
      await play(word.audioUrl);
    }
  };

  const handleAnswer = (index: number) => {
    if (answered !== null) return;
    setAnswered(index);
    if (index === currentQuestion.correctIndex) {
      setScore((s) => s + 1);
    }
    setTimeout(() => {
      if (quizIndex < questions.length - 1) {
        setQuizIndex((i) => i + 1);
        setAnswered(null);
      } else {
        setQuizDone(true);
      }
    }, 1000);
  };

  const handleQuizComplete = () => {
    markUnderstandComplete(surah.id);
    onComplete();
  };

  if (mode === 'explore') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-foreground">Understand</h3>
          <p className="mt-1 text-sm text-muted">
            Tap each word to hear it and see its meaning.
          </p>
        </div>

        {/* Ayah navigation */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            onClick={() => { setExploredAyahIndex((i) => Math.max(0, i - 1)); setSelectedWord(null); }}
            disabled={exploredAyahIndex === 0}
            className="text-muted disabled:opacity-30"
          >
            ←
          </button>
          <span className="font-medium text-teal">
            Ayah {exploredAyahIndex + 1} of {surah.ayahs.length}
          </span>
          <button
            onClick={() => { setExploredAyahIndex((i) => Math.min(surah.ayahs.length - 1, i + 1)); setSelectedWord(null); }}
            disabled={exploredAyahIndex === surah.ayahs.length - 1}
            className="text-muted disabled:opacity-30"
          >
            →
          </button>
        </div>

        {/* Word cards */}
        <div className="flex flex-wrap justify-center gap-3" dir="rtl">
          {currentAyah.words
            .filter((w) => w.charType === 'word')
            .map((word) => (
              <button
                key={`${currentAyah.key}-${word.position}`}
                onClick={() => handleWordClick(word)}
                className={cn(
                  'flex flex-col items-center rounded-xl border-2 px-4 py-3 transition-all',
                  selectedWord?.position === word.position
                    ? 'border-gold bg-gold/10 shadow-md'
                    : 'border-foreground/10 bg-white hover:border-gold/50'
                )}
              >
                <span className="arabic-text text-2xl">{word.textUthmani}</span>
                <span className="mt-1 text-xs text-muted" dir="ltr">
                  {word.transliteration}
                </span>
                <span className="mt-0.5 text-xs font-medium text-teal" dir="ltr">
                  {word.translation}
                </span>
              </button>
            ))}
        </div>

        {/* Translation */}
        {currentAyah.translation && (
          <p className="text-center text-sm italic text-muted">
            {currentAyah.translation}
          </p>
        )}

        <Button onClick={() => setMode('quiz')} className="w-full">
          Take the Quiz
        </Button>
      </div>
    );
  }

  // Quiz mode
  if (quizDone) {
    const passed = score >= Math.ceil(questions.length * 0.6);
    return (
      <div className="space-y-6 text-center">
        <h3 className="text-xl font-bold text-foreground">
          {passed ? 'Well done!' : 'Almost there!'}
        </h3>
        <p className="text-lg text-muted">
          {score} / {questions.length} correct
        </p>
        {passed ? (
          <Button onClick={handleQuizComplete} className="w-full">
            Continue
          </Button>
        ) : (
          <Button
            onClick={() => {
              setQuizIndex(0);
              setScore(0);
              setAnswered(null);
              setQuizDone(false);
            }}
            className="w-full"
          >
            Try Again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Quick Quiz</h3>
        <p className="mt-1 text-sm text-muted">
          Question {quizIndex + 1} of {questions.length}
        </p>
      </div>

      {/* Word to identify */}
      <div className="text-center">
        <span className="arabic-text text-4xl">{currentQuestion.word.textUthmani}</span>
        {currentQuestion.word.transliteration && (
          <p className="mt-2 text-sm text-muted">{currentQuestion.word.transliteration}</p>
        )}
      </div>

      {/* Options */}
      <div className="space-y-3">
        {currentQuestion.options.map((option, i) => {
          const isCorrect = i === currentQuestion.correctIndex;
          const isSelected = i === answered;

          return (
            <button
              key={i}
              onClick={() => handleAnswer(i)}
              disabled={answered !== null}
              className={cn(
                'w-full rounded-xl border-2 px-4 py-3 text-left font-medium transition-all',
                answered === null && 'border-foreground/10 hover:border-teal/50',
                isSelected && isCorrect && 'border-success bg-success/10 text-success',
                isSelected && !isCorrect && 'border-red-500 bg-red-50 text-red-600',
                answered !== null && isCorrect && !isSelected && 'border-success/50 bg-success/5'
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
