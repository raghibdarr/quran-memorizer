'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import type { Surah, Ayah, TestLevel } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useAudio } from '@/hooks/use-audio';
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
    // Level 3 (full recall) always passes — user already chose "Continue Anyway" or all got-it
    const passed = level === 'full-recall' ? true : score >= Math.ceil(total * 0.5);
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

      {/* Result screen */}
      {resultScreen ? (
        <div className="space-y-5 py-4">
          <div className="text-center">
            {(() => {
              const isFlawless = resultScreen.score === resultScreen.total;
              const isAlmostPerfect = resultScreen.score >= resultScreen.total - 1 && !isFlawless;
              const isGood = resultScreen.type === 'pass' && !isFlawless && !isAlmostPerfect;
              const isFail = resultScreen.type === 'fail';
              // For level 3: use score-based messaging, not pass/fail
              const isLevel3 = level === 'full-recall';
              const iconColor = isFlawless ? 'bg-success/10' :
                isAlmostPerfect ? 'bg-success/10' :
                isFail && !isLevel3 ? 'bg-red-500/10' :
                'bg-gold/10';

              return (
                <>
                  <div className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-full', iconColor)}>
                    {isFlawless || isAlmostPerfect ? (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2D7A4F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : isFail && !isLevel3 ? (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C8963E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    )}
                  </div>

                  <h3 className="mt-3 text-lg font-bold text-foreground">
                    {isFlawless ? 'Flawless!'
                      : isAlmostPerfect ? 'Almost perfect!'
                      : isFail && !isLevel3 ? 'Not quite there yet'
                      : resultScreen.mistakes.length > 0 ? 'Some ayahs need work'
                      : 'Well done!'}
                  </h3>

                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {resultScreen.score} / {resultScreen.total}
                  </p>

                  <p className="mt-1 text-sm text-muted">
                    {isFlawless ? 'No mistakes — well done!'
                      : isFail && !isLevel3 ? 'Go back and review the ayahs you struggled with, then try again.'
                      : resultScreen.mistakes.length > 0 ? `${resultScreen.mistakes.length} ayah${resultScreen.mistakes.length !== 1 ? 's' : ''} flagged for review.`
                      : 'Great job!'}
                  </p>
                </>
              );
            })()}
          </div>

          {/* Show mistakes */}
          {resultScreen.mistakes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted">Needs work:</p>
              {resultScreen.mistakes.map((idx) => (
                <div key={idx} className="rounded-xl bg-gold/5 border border-gold/10 p-3">
                  <AyahDisplay ayah={ayahs[idx]} />
                </div>
              ))}
            </div>
          )}

          {resultScreen.type === 'pass' || level === 'full-recall' ? (
            <Button onClick={advanceLevel} className="w-full">
              {level === 'full-recall' ? 'Complete Lesson' : 'Next Level'}
            </Button>
          ) : (
            <Button onClick={onRetry} className="w-full">
              Review & Retry
            </Button>
          )}
        </div>
      ) : (
        <>
          {level === 'fill-blank' && (
            <FillBlankTest ayahs={ayahs} onResult={handleResult} />
          )}
          {level === 'first-letter' && (
            <FirstLetterTest surah={surah} ayahs={ayahs} onResult={handleResult} />
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
    // Deduplicate by text and exclude words matching the blank
    const seen = new Set<string>([blankWord.textUthmani]);
    const others: Array<{ text: string; transliteration: string | null }> = [];
    for (const w of allWords.sort(() => Math.random() - 0.5)) {
      if (!seen.has(w.textUthmani)) {
        seen.add(w.textUthmani);
        others.push({ text: w.textUthmani, transliteration: w.transliteration });
        if (others.length >= 3) break;
      }
    }
    const opts = [...others,
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
  surah,
  ayahs,
  onResult,
}: {
  surah: Surah;
  ayahs: Ayah[];
  onResult: (score: number, total: number, mistakes: number[]) => void;
}) {
  const [ayahIndex, setAyahIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const getAudioUrl = (surahId: number, ayahNum: number) =>
    buildAudioUrl(surahId, ayahNum, useSettingsStore.getState().reciter);

  const playAyah = async () => {
    setIsPlaying(true);
    await audioController.playAndWait(getAudioUrl(surah.id, ayahs[ayahIndex].number));
    setIsPlaying(false);
  };

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
          <div className={cn(
            'rounded-xl p-5 transition-none',
            isPlaying ? 'bg-teal/5 border border-teal/30' : 'bg-success/5'
          )}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isPlaying && (
                  <div className="flex items-end gap-[2px] h-4">
                    <div className="w-[3px] bg-teal rounded-full animate-[bar1_0.8s_ease-in-out_infinite]" />
                    <div className="w-[3px] bg-teal rounded-full animate-[bar2_0.8s_ease-in-out_infinite_0.2s]" />
                    <div className="w-[3px] bg-teal rounded-full animate-[bar3_0.8s_ease-in-out_infinite_0.4s]" />
                  </div>
                )}
                <span className="text-xs text-muted">Ayah {ayah.number}</span>
              </div>
              <button
                onClick={playAyah}
                className="rounded-full p-1.5 text-muted hover:text-foreground hover:bg-foreground/5"
                title="Play ayah"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </button>
            </div>
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

// === Full Recall (practice-style per-ayah rating) ===

type RecallRating = 'got-it' | 'shaky' | 'missed';

const RECALL_COLORS: Record<RecallRating, string> = {
  'got-it': 'text-success bg-success/10',
  'shaky': 'text-gold bg-gold/10',
  'missed': 'text-red-400 bg-red-400/10',
};

const RECALL_LABELS: Record<RecallRating, string> = {
  'got-it': 'Got it',
  'shaky': 'Shaky',
  'missed': 'Missed',
};

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
  const [revealedAyahs, setRevealedAyahs] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Record<string, RecallRating>>({});
  const [flaggedRatings, setFlaggedRatings] = useState<Record<string, RecallRating>>({});
  const { reviewCard, addCard } = useReviewStore();

  // Audio state
  const { isPlaying: audioIsPlaying, isPaused: audioIsPaused } = useAudio();
  const [playingAll, setPlayingAll] = useState(false);
  const [playingIdx, setPlayingIdx] = useState(-1);
  const [currentSpeed, setCurrentSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const abortRef = useRef(false);

  const getAudioUrl = (surahId: number, ayahNum: number) =>
    buildAudioUrl(surahId, ayahNum, useSettingsStore.getState().reciter);

  const allRevealed = revealedAyahs.size === ayahs.length;
  const allRated = ayahs.every((a) => ratings[a.key]);

  const toggleReveal = (key: string) => {
    setRevealedAyahs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const revealAll = () => setRevealedAyahs(new Set(ayahs.map((a) => a.key)));
  const hideAll = () => setRevealedAyahs(new Set());

  const rateAyah = (key: string, rating: RecallRating) => {
    setRatings((prev) => ({ ...prev, [key]: rating }));
  };

  const playAyah = useCallback(async (ayah: Ayah, idx: number) => {
    if (playingAll) return;
    setPlayingIdx(idx);
    await audioController.playAndWait(getAudioUrl(surah.id, ayah.number));
    setPlayingIdx(-1);
  }, [playingAll, surah.id]);

  const playAllAyahs = useCallback(async () => {
    if (playingAll) return;
    abortRef.current = false;
    setPlayingAll(true);
    for (let i = 0; i < ayahs.length; i++) {
      if (abortRef.current) break;
      setPlayingIdx(i);
      await audioController.playAndWait(getAudioUrl(surah.id, ayahs[i].number));
      if (!abortRef.current && i < ayahs.length - 1) {
        await new Promise<void>((r) => setTimeout(r, 400));
      }
    }
    setPlayingIdx(-1);
    setPlayingAll(false);
  }, [ayahs, playingAll, surah.id]);

  const stopPlayback = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
    setPlayingIdx(-1);
  }, []);

  const RECALL_QUALITY: Record<RecallRating, number> = {
    'got-it': 5,
    'shaky': 3,
    'missed': 1,
  };

  const handleFinish = () => {
    // Update review cards with per-ayah ratings
    for (const ayah of ayahs) {
      const rating = ratings[ayah.key];
      if (rating) {
        addCard(surah.id, ayah.number); // ensure card exists
        reviewCard(surah.id, ayah.number, RECALL_QUALITY[rating]);
      }
    }

    const gotItCount = ayahs.filter((a) => ratings[a.key] === 'got-it').length;
    const mistakes = ayahs
      .map((a, i) => ({ idx: i, rating: ratings[a.key] }))
      .filter((r) => r.rating !== 'got-it')
      .map((r) => r.idx);
    onResult(gotItCount, ayahs.length, mistakes);
  };

  const handleRetry = () => {
    // Save ratings for flag colors, then reset
    const newFlagged: Record<string, RecallRating> = {};
    for (const a of ayahs) {
      if (ratings[a.key] && ratings[a.key] !== 'got-it') {
        newFlagged[a.key] = ratings[a.key];
      }
    }
    setFlaggedRatings(newFlagged);
    setRatings({});
    setRevealedAyahs(new Set());
    stopPlayback();
  };

  const hasWeakAyahs = Object.values(ratings).some((r) => r !== 'got-it');

  const getFlagDotColor = (key: string) => {
    const r = flaggedRatings[key];
    if (r === 'missed') return 'bg-red-400';
    if (r === 'shaky') return 'bg-gold';
    return '';
  };

  if (!started) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-10 text-center">
          <p className="arabic-text text-3xl text-teal">{surah.nameArabic}</p>
          <p className="mt-2 text-lg font-semibold">{lessonLabel}</p>
          <p className="mt-4 text-sm text-muted">
            Recite all {ayahs.length} ayahs from memory, then reveal and rate each one
          </p>
        </div>
        <Button onClick={() => setStarted(true)} className="w-full">
          Begin Recitation
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Reveal toggle */}
      <button
        onClick={allRevealed ? hideAll : revealAll}
        className="w-full rounded-xl bg-foreground/5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/10"
      >
        {allRevealed ? 'Hide All' : 'Reveal All'}
      </button>

      {/* Per-ayah cards */}
      <div className="space-y-3">
        {ayahs.map((ayah, idx) => {
          const isRevealed = revealedAyahs.has(ayah.key);
          const rating = ratings[ayah.key];
          const isFlagged = !!flaggedRatings[ayah.key];
          const flagColor = getFlagDotColor(ayah.key);
          const isAyahPlaying = playingIdx === idx;

          return (
            <div
              key={ayah.key}
              className={cn(
                'rounded-xl p-4 transition-none',
                isAyahPlaying ? 'bg-teal/5 border border-teal/30' :
                isRevealed ? 'bg-card shadow-sm' :
                'border-2 border-dashed border-foreground/15'
              )}
            >
              {isRevealed ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isAyahPlaying && audioIsPlaying ? (
                        <div className="flex items-end gap-[2px] h-4">
                          <div className="w-[3px] bg-teal rounded-full animate-[bar1_0.8s_ease-in-out_infinite]" />
                          <div className="w-[3px] bg-teal rounded-full animate-[bar2_0.8s_ease-in-out_infinite_0.2s]" />
                          <div className="w-[3px] bg-teal rounded-full animate-[bar3_0.8s_ease-in-out_infinite_0.4s]" />
                        </div>
                      ) : null}
                      <p className="text-xs text-muted">
                        {isFlagged && <span className={cn('mr-1 inline-block h-2 w-2 rounded-full', flagColor)} />}
                        Ayah {ayah.number}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => playAyah(ayah, idx)}
                        className="rounded-full p-1.5 text-muted hover:text-foreground hover:bg-foreground/5"
                      >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                      <button
                        onClick={() => toggleReveal(ayah.key)}
                        className="rounded-full p-1.5 text-muted hover:text-foreground hover:bg-foreground/5"
                      >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <AyahDisplay ayah={ayah} />
                  <div className="flex gap-1.5 pt-1">
                    {(['got-it', 'shaky', 'missed'] as RecallRating[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => rateAyah(ayah.key, r)}
                        className={cn(
                          'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                          rating === r ? RECALL_COLORS[r] : 'bg-foreground/5 text-muted hover:bg-foreground/10'
                        )}
                      >
                        {RECALL_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button onClick={() => toggleReveal(ayah.key)} className="w-full">
                  <p className="text-center text-sm text-muted py-2">
                    {isFlagged && <span className={cn('mr-1 inline-block h-2 w-2 rounded-full', flagColor)} />}
                    Ayah {ayah.number} — tap to reveal
                  </p>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky media controls — show after all revealed */}
      {allRevealed && (
        <div className="sticky bottom-16 rounded-2xl bg-card p-3 shadow-lg border border-foreground/10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (playingAll && audioIsPlaying) audioController.pause();
                else if (playingAll && audioIsPaused) audioController.resume();
                else playAllAyahs();
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-teal text-white shadow-lg transition-transform hover:scale-105"
            >
              {playingAll && audioIsPlaying ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z" /></svg>
              )}
            </button>
            <button
              onClick={stopPlayback}
              disabled={!playingAll}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-30"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>
            </button>
            <div className="flex-1 text-center">
              <p className="text-xs text-muted">
                {playingAll ? `Ayah ${playingIdx + 1} / ${ayahs.length}` : 'Tap play or ayah'}
              </p>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="rounded-lg bg-foreground/5 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-foreground/10"
              >
                {currentSpeed}x
              </button>
              {showSpeedMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSpeedMenu(false)} />
                  <div className="absolute bottom-8 right-0 z-50 rounded-lg bg-card shadow-lg border border-foreground/10 py-1">
                    {[0.5, 0.75, 1, 1.25, 1.5].map((s) => (
                      <button
                        key={s}
                        onClick={() => { setCurrentSpeed(s); audioController.setSpeed(s); setShowSpeedMenu(false); }}
                        className={cn(
                          'block w-full px-4 py-1.5 text-left text-xs font-medium',
                          s === currentSpeed ? 'text-teal bg-teal/5' : 'text-foreground hover:bg-foreground/5'
                        )}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {allRated && (
        <div className="space-y-3">
          {hasWeakAyahs && (
            <Button onClick={handleRetry} variant="secondary" className="w-full">
              Retry with Weak Flagged
            </Button>
          )}
          <Button onClick={handleFinish} className="w-full">
            {hasWeakAyahs ? 'Continue Anyway' : 'Complete Level'}
          </Button>
        </div>
      )}
      {!allRated && revealedAyahs.size > 0 && (
        <p className="text-center text-xs text-muted">
          Rate each revealed ayah to continue
        </p>
      )}
    </div>
  );
}
