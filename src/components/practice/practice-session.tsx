'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Ayah, PracticeAyahRating, PracticeAyahResult, PracticeOverallRating, PracticeSession as PracticeSessionType } from '@/types/quran';
import { useRecorder } from '@/hooks/use-recorder';
import { useWhisper } from '@/hooks/use-whisper';
import { compareAyahText, transliterateArabic } from '@/lib/arabic-compare';
import { useReviewStore } from '@/stores/review-store';
import { usePracticeStore } from '@/stores/practice-store';
import { useSettingsStore } from '@/stores/settings-store';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import ArabicText from '@/components/ui/arabic-text';
import { cn } from '@/lib/cn';

type SessionStep = 'ayah-by-ayah' | 'full-passage' | 'results';

interface PracticeSessionProps {
  surahIds: number[];
  title: string;
  ayahs: Ayah[];
  lessonIds: string[];
  initialStep?: SessionStep;
  onDone: () => void;
}

const RATING_QUALITY: Record<PracticeAyahRating, number> = {
  'got-it': 5,
  'hesitated': 3,
  'missed': 1,
};

const RATING_COLORS: Record<PracticeAyahRating, string> = {
  'got-it': 'text-success bg-success/10',
  'hesitated': 'text-gold bg-gold/10',
  'missed': 'text-red-500 bg-red-500/10',
};

const RATING_LABELS: Record<PracticeAyahRating, string> = {
  'got-it': 'Got it',
  'hesitated': 'Hesitated',
  'missed': 'Missed',
};

export default function PracticeSession({
  surahIds,
  title,
  ayahs,
  lessonIds,
  initialStep = 'ayah-by-ayah',
  onDone,
}: PracticeSessionProps) {
  const isMultiSurah = surahIds.length > 1;
  const [step, setStep] = useState<SessionStep>(initialStep);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<PracticeAyahResult[]>([]);
  const [overallRating, setOverallRating] = useState<PracticeOverallRating | null>(null);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [wordResults, setWordResults] = useState<Array<{ word: string; correct: boolean }> | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const recorder = useRecorder();
  const whisper = useWhisper();
  const { reviewCard } = useReviewStore();
  const { addSession } = usePracticeStore();
  const transliterationEnabled = useSettingsStore((s) => s.transliterationEnabled);
  const translationEnabled = useSettingsStore((s) => s.translationEnabled);

  const currentAyah = ayahs[currentIdx];

  // Auto-load Whisper model on mount if mic is available
  useEffect(() => {
    if (recorder.isSupported) {
      whisper.loadModel();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.isSupported]);

  const resetAyahState = useCallback(() => {
    setRevealed(false);
    setTranscribedText(null);
    setWordResults(null);
    setAccuracy(null);
  }, []);

  // Extract surahId from ayah key (e.g. "114:1" → 114)
  const getAyahSurahId = (ayah: Ayah) => parseInt(ayah.key.split(':')[0], 10);

  const rateAyah = (rating: PracticeAyahRating) => {
    const result: PracticeAyahResult = {
      surahId: getAyahSurahId(currentAyah),
      ayahNumber: currentAyah.number,
      rating,
      accuracy: accuracy ?? undefined,
    };
    setResults((prev) => [...prev, result]);

    // Advance
    if (currentIdx < ayahs.length - 1) {
      setCurrentIdx((i) => i + 1);
      resetAyahState();
    } else {
      // All ayahs done — go to full passage step
      setStep('full-passage');
      resetAyahState();
    }
  };

  const handleRecord = async () => {
    if (recorder.isRecording) {
      const audio = await recorder.stop();
      if (audio) {
        setIsTranscribing(true);
        try {
          // Wait for model if it's still loading
          if (whisper.modelReady) {
            const text = await whisper.transcribe(audio);
            setTranscribedText(text);
            const comparison = compareAyahText(text, currentAyah.textUthmani);
            setWordResults(comparison.wordResults);
            setAccuracy(comparison.accuracy);
          }
          // If model not ready, skip transcription — user can still self-assess
        } catch {
          // Voice recognition failed — user can still self-assess
        }
        setIsTranscribing(false);
      }
      setRevealed(true);
    } else {
      await recorder.start();
    }
  };

  const handleReveal = () => setRevealed(true);

  const finishSession = (overall: PracticeOverallRating) => {
    setOverallRating(overall);

    // Update SM-2 review cards
    for (const result of results) {
      reviewCard(result.surahId, result.ayahNumber, RATING_QUALITY[result.rating]);
    }

    // Save practice session
    const session: PracticeSessionType = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      surahIds,
      lessonIds,
      ayahRange: { start: ayahs[0].number, end: ayahs[ayahs.length - 1].number },
      ayahResults: results,
      overallRating: overall,
    };
    addSession(session);

    setStep('results');
  };

  const retryWeak = () => {
    // This is handled by the parent via onDone — but we can filter results
    // and restart with only weak ayahs. For now, just call onDone and let parent handle.
    onDone();
  };


  // --- STEP 1: Ayah-by-ayah ---
  if (step === 'ayah-by-ayah') {
    return (
      <div className="space-y-4">
        {/* Progress */}
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-teal">{title}</span>
          <span className="text-muted">
            Ayah {currentIdx + 1} of {ayahs.length}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-teal transition-all"
            style={{ width: `${((currentIdx) / ayahs.length) * 100}%` }}
          />
        </div>

        {/* Ayah card */}
        <Card className="text-center">
          <p className="mb-3 text-xs text-muted">
            {isMultiSurah ? `${currentAyah.key}` : `Ayah ${currentAyah.number}`}
          </p>
          {revealed ? (
            <div>
              <ArabicText ayah={currentAyah} className="text-2xl leading-loose" />
              {currentAyah.transliteration && (
                <p className="mt-2 text-sm text-muted italic">{currentAyah.transliteration}</p>
              )}
              {/* Voice recognition results */}
              {transcribedText != null && (
                <div className="mt-4 space-y-3 rounded-xl bg-foreground/5 p-3">
                  {wordResults && (
                    <>
                      <p className="text-xs font-medium text-muted">
                        Accuracy: {Math.round((accuracy ?? 0) * 100)}%
                      </p>
                      <p className="arabic-text text-lg leading-loose" dir="rtl">
                        {wordResults.map((w, i) => (
                          <span
                            key={i}
                            className={cn(
                              'mx-0.5',
                              w.correct ? 'text-success' : 'text-red-500 underline decoration-wavy'
                            )}
                          >
                            {w.word}
                          </span>
                        ))}
                      </p>
                    </>
                  )}
                  <div className="border-t border-foreground/10 pt-2">
                    <p className="text-xs font-medium text-muted mb-1">What was heard:</p>
                    <p className="arabic-text text-base leading-loose" dir="rtl">{transcribedText || '(empty)'}</p>
                    {transcribedText && (
                      <p className="mt-1 text-sm text-muted italic">{transliterateArabic(transcribedText)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8">
              <p className="text-lg text-muted">Recite from memory...</p>
              <p className="mt-1 text-xs text-muted">
                Then reveal to check, or use the mic for voice recognition
              </p>
            </div>
          )}
        </Card>

        {/* Controls */}
        {!revealed ? (
          <div className="flex gap-3">
            {recorder.isSupported && (
              <button
                onClick={handleRecord}
                disabled={isTranscribing}
                className={cn(
                  'flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full transition-all',
                  recorder.isRecording
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-teal/10 text-teal hover:bg-teal/20'
                )}
                title={recorder.isRecording ? 'Stop recording' : 'Start recording'}
              >
                {isTranscribing ? (
                  <LoadingSpinner />
                ) : recorder.isRecording ? (
                  <StopIcon />
                ) : (
                  <MicIcon />
                )}
              </button>
            )}
            <Button onClick={handleReveal} variant="secondary" className="flex-1">
              Reveal Text
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-center text-xs font-medium text-muted">How did you do?</p>
            <div className="flex gap-2">
              {(['got-it', 'hesitated', 'missed'] as PracticeAyahRating[]).map((rating) => (
                <button
                  key={rating}
                  onClick={() => rateAyah(rating)}
                  className={cn(
                    'flex-1 rounded-xl py-3 text-sm font-semibold transition-colors',
                    RATING_COLORS[rating]
                  )}
                >
                  {RATING_LABELS[rating]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Whisper model loading status */}
        {recorder.isSupported && whisper.isLoading && (
          <div className="text-center">
            <p className="text-xs text-muted">
              Loading voice model... {whisper.downloadProgress}%
            </p>
            <div className="mt-1 h-1 rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-teal transition-all"
                style={{ width: `${whisper.downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {whisper.error && (
          <p className="text-center text-xs text-red-500">Voice model: {whisper.error}</p>
        )}

        {recorder.error && (
          <p className="text-center text-xs text-red-500">{recorder.error}</p>
        )}
      </div>
    );
  }

  // --- STEP 2: Full passage ---
  // Per-ayah ratings for full-passage mode
  const [passageAyahRatings, setPassageAyahRatings] = useState<Record<number, PracticeAyahRating>>({});
  const allAyahsRated = revealed && ayahs.every((a) => passageAyahRatings[a.number] || results.find((r) => r.ayahNumber === a.number));

  const ratePassageAyah = (ayahNumber: number, rating: PracticeAyahRating) => {
    setPassageAyahRatings((prev) => ({ ...prev, [ayahNumber]: rating }));
    // Also add to results for SM-2
    const ayah = ayahs.find((a) => a.number === ayahNumber);
    if (ayah) {
      setResults((prev) => {
        // Replace if already rated
        const filtered = prev.filter((r) => r.ayahNumber !== ayahNumber);
        return [...filtered, { surahId: getAyahSurahId(ayah), ayahNumber, rating }];
      });
    }
  };

  if (step === 'full-passage') {
    const hasPriorResults = results.length > 0 && !Object.keys(passageAyahRatings).length;
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-bold text-foreground">
            {hasPriorResults ? 'Recite Together' : title}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {hasPriorResults
              ? `Now try reciting all ${ayahs.length} ayahs together`
              : `Recite all ${ayahs.length} ayahs, then reveal to check`}
          </p>
        </div>

        {!revealed ? (
          <>
            <Card>
              <div className="py-12 text-center">
                <p className="text-lg text-muted">Recite from memory...</p>
                <p className="mt-1 text-xs text-muted">
                  Ayahs {ayahs[0].number}–{ayahs[ayahs.length - 1].number}
                </p>
              </div>
            </Card>
            <Button onClick={handleReveal} className="w-full">
              Reveal Text
            </Button>
          </>
        ) : (
          <>
            {/* Revealed ayahs with per-ayah rating */}
            <div className="space-y-3">
              {ayahs.map((ayah) => {
                const priorResult = results.find((r) => r.ayahNumber === ayah.number);
                const currentRating = passageAyahRatings[ayah.number] ?? priorResult?.rating;
                return (
                  <Card key={ayah.number} className="space-y-2">
                    <p className="text-xs text-muted">
                      {isMultiSurah ? ayah.key : `Ayah ${ayah.number}`}
                    </p>
                    <ArabicText ayah={ayah} className="text-xl leading-loose" />
                    {transliterationEnabled && ayah.transliteration && (
                      <p className="text-sm text-muted italic">{ayah.transliteration}</p>
                    )}
                    {translationEnabled && ayah.translation && (
                      <p className="text-sm text-muted">{ayah.translation}</p>
                    )}
                    {/* Per-ayah rating */}
                    <div className="flex gap-1.5 pt-1">
                      {(['got-it', 'hesitated', 'missed'] as PracticeAyahRating[]).map((rating) => (
                        <button
                          key={rating}
                          onClick={() => ratePassageAyah(ayah.number, rating)}
                          className={cn(
                            'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                            currentRating === rating
                              ? RATING_COLORS[rating]
                              : 'bg-foreground/5 text-muted hover:bg-foreground/10'
                          )}
                        >
                          {RATING_LABELS[rating]}
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Overall rating — only show after all ayahs rated */}
            {allAyahsRated && (
              <div className="space-y-2">
                <p className="text-center text-xs font-medium text-muted">Overall, how did it go?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => finishSession('smooth')}
                    className="flex-1 rounded-xl bg-success/10 py-3 text-sm font-semibold text-success transition-colors"
                  >
                    Smooth
                  </button>
                  <button
                    onClick={() => finishSession('some-mistakes')}
                    className="flex-1 rounded-xl bg-gold/10 py-3 text-sm font-semibold text-gold transition-colors"
                  >
                    Some mistakes
                  </button>
                  <button
                    onClick={() => finishSession('need-practice')}
                    className="flex-1 rounded-xl bg-red-500/10 py-3 text-sm font-semibold text-red-500 transition-colors"
                  >
                    Need practice
                  </button>
                </div>
              </div>
            )}
            {!allAyahsRated && (
              <p className="text-center text-xs text-muted">
                Rate each ayah above, then give an overall rating
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  // --- STEP 3: Results ---
  const gotItCount = results.filter((r) => r.rating === 'got-it').length;
  const hesitatedCount = results.filter((r) => r.rating === 'hesitated').length;
  const missedCount = results.filter((r) => r.rating === 'missed').length;
  const overallScore = results.length > 0 ? Math.round((gotItCount / results.length) * 100) : 0;
  const hasWeakAyahs = hesitatedCount + missedCount > 0;
  const hasAyahResults = results.length > 0;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div
          className={cn(
            'mx-auto flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold',
            overallScore >= 80 ? 'bg-success/10 text-success' :
            overallScore >= 50 ? 'bg-gold/10 text-gold' :
            'bg-red-500/10 text-red-500'
          )}
        >
          {overallScore}%
        </div>
        <h3 className="mt-3 text-xl font-bold text-foreground">Practice Complete</h3>
        <p className="text-sm text-muted">{title} — {ayahs.length} ayahs</p>
      </div>

      {/* Summary stats */}
      <div className="flex justify-center gap-6">
        <div className="text-center">
          <p className="text-lg font-bold text-success">{gotItCount}</p>
          <p className="text-[10px] text-muted">Got it</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gold">{hesitatedCount}</p>
          <p className="text-[10px] text-muted">Hesitated</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-red-500">{missedCount}</p>
          <p className="text-[10px] text-muted">Missed</p>
        </div>
      </div>

      {overallRating && (
        <div className="rounded-xl bg-foreground/5 p-3 text-center text-sm text-muted">
          Full passage: <span className="font-medium text-foreground capitalize">{overallRating.replace('-', ' ')}</span>
        </div>
      )}

      {/* Per-ayah results */}
      <div className="space-y-1">
        {results.map((result) => (
          <div
            key={result.ayahNumber}
            className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2',
              RATING_COLORS[result.rating]
            )}
          >
            <span className="text-sm">
              {isMultiSurah ? `${result.surahId}:${result.ayahNumber}` : `Ayah ${result.ayahNumber}`}
            </span>
            <div className="flex items-center gap-2">
              {result.accuracy != null && (
                <span className="text-xs opacity-70">{Math.round(result.accuracy * 100)}%</span>
              )}
              <span className="text-xs font-medium">{RATING_LABELS[result.rating]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        {hasWeakAyahs && (
          <Button onClick={retryWeak} className="w-full">
            Retry Weak Ayahs
          </Button>
        )}
        <Button onClick={onDone} variant={hasWeakAyahs ? 'secondary' : 'primary'} className="w-full">
          Done
        </Button>
      </div>
    </div>
  );
}

// Small inline icons for mic controls
function MicIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}
