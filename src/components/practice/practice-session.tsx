'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Ayah, LessonDef, PracticeAyahRating, PracticeAyahResult, PracticeSession as PracticeSessionType } from '@/types/quran';
import { useRecorder } from '@/hooks/use-recorder';
import { useWhisper } from '@/hooks/use-whisper';
import { useAudio } from '@/hooks/use-audio';
import { audioController } from '@/lib/audio';
import { useReciterAudioUrl } from '@/hooks/use-ayah-audio';
import { compareAyahText, transliterateArabic } from '@/lib/arabic-compare';
import { useReviewStore } from '@/stores/review-store';
import { useProgressStore } from '@/stores/progress-store';
import { usePracticeStore } from '@/stores/practice-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useStatsStore } from '@/stores/stats-store';
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
  surahNames?: Record<number, string>;  // surahId → name, for cross-surah dividers
  flaggedAyahs?: number[];  // ayah numbers to highlight as weak (from review page)
  allLessonDefs?: LessonDef[];  // lesson definitions for auto-completion
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
  'hesitated': 'Shaky',
  'missed': 'Missed',
};

export default function PracticeSession({
  surahIds,
  title,
  ayahs,
  lessonIds,
  initialStep = 'ayah-by-ayah',
  surahNames = {},
  flaggedAyahs = [],
  allLessonDefs = [],
  onDone,
}: PracticeSessionProps) {
  const isMultiSurah = surahIds.length > 1;
  const [step, setStep] = useState<SessionStep>(initialStep);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<PracticeAyahResult[]>([]);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [wordResults, setWordResults] = useState<Array<{ word: string; correct: boolean }> | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Flagged ayahs from retry (merged with prop)
  const [flaggedFromRetry, setFlaggedFromRetry] = useState<Record<number, PracticeAyahRating>>({});
  const activeFlaggedAyahs = Object.keys(flaggedFromRetry).length > 0
    ? Object.keys(flaggedFromRetry).map(Number)
    : flaggedAyahs;

  const getFlagDotColor = (ayahNumber: number) => {
    const rating = flaggedFromRetry[ayahNumber];
    if (rating === 'missed') return 'bg-red-400';
    if (rating === 'hesitated') return 'bg-gold';
    return 'bg-gold'; // default for prop-based flags
  };

  // Full-passage mode state
  const [passageAyahRatings, setPassageAyahRatings] = useState<Record<number, PracticeAyahRating>>({});
  const [revealedAyahs, setRevealedAyahs] = useState<Set<string>>(new Set());
  // Audio playback state
  const [playingAll, setPlayingAll] = useState(false);
  const [currentPlayingAyahIdx, setCurrentPlayingAyahIdx] = useState(-1);
  const [currentSpeed, setCurrentSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const abortPlayRef = useRef(false);

  const recorder = useRecorder();
  const whisper = useWhisper();
  const audio = useAudio();
  const getAudioUrl = useReciterAudioUrl();
  const { reviewCard, cards: reviewCards } = useReviewStore();
  const { startLesson, completeLesson } = useProgressStore();
  const progressLessons = useProgressStore((s) => s.lessons);
  const { addSession } = usePracticeStore();
  const recordActivity = useStatsStore((s) => s.recordActivity);
  const addAyahsMemorized = useStatsStore((s) => s.addAyahsMemorized);
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

  const getAyahSurahId = (ayah: Ayah) => parseInt(ayah.key.split(':')[0], 10);

  const ayahLabel = (ayah: Ayah) => isMultiSurah ? ayah.key : `Ayah ${ayah.number}`;

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortPlayRef.current = true; audioController.stop(); };
  }, []);

  const playAyah = useCallback(async (ayah: Ayah, idx?: number) => {
    if (playingAll) return;
    const [sId, aNum] = ayah.key.split(':').map(Number);
    if (idx !== undefined) setCurrentPlayingAyahIdx(idx);
    await audioController.playAndWait(getAudioUrl(sId, aNum));
    setCurrentPlayingAyahIdx(-1);
  }, [playingAll, getAudioUrl]);

  const playAllAyahs = useCallback(async () => {
    if (playingAll) return;
    abortPlayRef.current = false;
    setPlayingAll(true);
    for (let i = 0; i < ayahs.length; i++) {
      if (abortPlayRef.current) break;
      setCurrentPlayingAyahIdx(i);
      const [sId, aNum] = ayahs[i].key.split(':').map(Number);
      await audioController.playAndWait(getAudioUrl(sId, aNum));
      if (!abortPlayRef.current && i < ayahs.length - 1) {
        await new Promise<void>((r) => setTimeout(r, 400));
      }
    }
    setCurrentPlayingAyahIdx(-1);
    setPlayingAll(false);
  }, [ayahs, playingAll, getAudioUrl]);

  const stopPlayback = useCallback(() => {
    abortPlayRef.current = true;
    audioController.stop();
    setPlayingAll(false);
    setCurrentPlayingAyahIdx(-1);
  }, []);

  const handleSpeedChange = (speed: number) => {
    setCurrentSpeed(speed);
    audio.setSpeed(speed);
    setShowSpeedMenu(false);
  };

  const rateAyah = (rating: PracticeAyahRating) => {
    const result: PracticeAyahResult = {
      surahId: getAyahSurahId(currentAyah),
      ayahNumber: currentAyah.number,
      rating,
      accuracy: accuracy ?? undefined,
    };
    setResults((prev) => [...prev, result]);

    if (currentIdx < ayahs.length - 1) {
      setCurrentIdx((i) => i + 1);
      resetAyahState();
    } else {
      // All ayahs rated — go straight to results
      finishSession([...results, result]);
    }
  };

  const handleRecord = async () => {
    if (recorder.isRecording) {
      const audioData = await recorder.stop();
      if (audioData) {
        setIsTranscribing(true);
        try {
          if (whisper.modelReady) {
            const text = await whisper.transcribe(audioData, currentAyah.textUthmani);
            setTranscribedText(text);
            const comparison = compareAyahText(text, currentAyah.textUthmani);
            setWordResults(comparison.wordResults);
            setAccuracy(comparison.accuracy);
          }
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

  const finishSession = (resultsToSave?: PracticeAyahResult[]) => {
    const finalResults = resultsToSave ?? results;

    // Update review cards with ratings
    for (const result of finalResults) {
      reviewCard(result.surahId, result.ayahNumber, RATING_QUALITY[result.rating]);
    }

    // Auto-complete lessons where all ayahs are now "got-it"
    if (allLessonDefs.length > 0) {
      // Build quality map with this session's updates applied
      const updatedQualities = new Map<string, number>();
      for (const card of reviewCards) {
        updatedQualities.set(`${card.surahId}:${card.ayahNumber}`, card.lastQuality);
      }
      for (const result of finalResults) {
        updatedQualities.set(`${result.surahId}:${result.ayahNumber}`, RATING_QUALITY[result.rating]);
      }

      // Check each lesson: if all its ayahs are strong (quality >= 4), auto-complete
      for (const lesson of allLessonDefs) {
        if (progressLessons[lesson.lessonId]?.completedAt) continue; // already done
        let allStrong = true;
        for (let n = lesson.ayahStart; n <= lesson.ayahEnd; n++) {
          const q = updatedQualities.get(`${lesson.surahId}:${n}`);
          if (q === undefined || q < 4) { allStrong = false; break; }
        }
        if (allStrong) {
          startLesson(lesson.lessonId, lesson.surahId);
          completeLesson(lesson.lessonId);
          addAyahsMemorized(lesson.ayahEnd - lesson.ayahStart + 1);
        }
      }
    }

    const session: PracticeSessionType = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      surahIds,
      lessonIds,
      ayahRange: { start: ayahs[0].number, end: ayahs[ayahs.length - 1].number },
      ayahResults: finalResults,
      overallRating: null,
    };
    addSession(session);
    recordActivity();
    setResults(finalResults);
    setStep('results');
  };

  const ratePassageAyah = (ayahNumber: number, rating: PracticeAyahRating) => {
    setPassageAyahRatings((prev) => ({ ...prev, [ayahNumber]: rating }));
    const ayah = ayahs.find((a) => a.number === ayahNumber);
    if (ayah) {
      setResults((prev) => {
        const filtered = prev.filter((r) => r.ayahNumber !== ayahNumber);
        return [...filtered, { surahId: getAyahSurahId(ayah), ayahNumber, rating }];
      });
    }
  };

  const togglePassageAyah = (ayahKey: string) => {
    setRevealedAyahs((prev) => {
      const next = new Set(prev);
      if (next.has(ayahKey)) next.delete(ayahKey);
      else next.add(ayahKey);
      return next;
    });
  };

  const revealAll = () => setRevealedAyahs(new Set(ayahs.map((a) => a.key)));
  const hideAll = () => setRevealedAyahs(new Set());
  const allRevealed = revealedAyahs.size === ayahs.length;

  const allAyahsRated = ayahs.every((a) =>
    passageAyahRatings[a.number] || results.find((r) => r.ayahNumber === a.number)
  );

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
            {activeFlaggedAyahs.includes(currentAyah.number) && <span className={cn('mr-1 inline-block h-2 w-2 rounded-full', getFlagDotColor(currentAyah.number))} />}
            {ayahLabel(currentAyah)}
          </p>
          {revealed ? (
            <div>
              <ArabicText ayah={currentAyah} className="text-center text-4xl leading-loose" />
              {transliterationEnabled && currentAyah.transliteration && (
                <p className="mt-2 text-sm text-muted text-center">{currentAyah.transliteration}</p>
              )}
              {translationEnabled && currentAyah.translation && (
                <p className="mt-1 text-center text-sm italic text-muted">{currentAyah.translation}</p>
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
            {/* Play audio + Retry */}
            <div className="flex gap-2">
              <button
                onClick={() => playAyah(currentAyah)}
                className="flex-1 rounded-xl bg-foreground/5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/10"
              >
                <PlayIcon /> Play
              </button>
              <button
                onClick={resetAyahState}
                className="flex-1 rounded-xl bg-foreground/5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/10"
              >
                Retry
              </button>
            </div>
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

  // --- STEP 2: Full passage / All at once ---
  if (step === 'full-passage') {
    const hasPriorResults = results.length > 0 && Object.keys(passageAyahRatings).length === 0;
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
            const isAyahRevealed = revealedAyahs.has(ayah.key);
            const priorResult = results.find((r) => r.ayahNumber === ayah.number);
            const currentRating = passageAyahRatings[ayah.number] ?? priorResult?.rating;
            const isAyahPlaying = currentPlayingAyahIdx === idx;
            // Surah divider for cross-surah sessions
            const currentSurahId = getAyahSurahId(ayah);
            const prevSurahId = idx > 0 ? getAyahSurahId(ayahs[idx - 1]) : null;
            const showSurahDivider = idx === 0 || currentSurahId !== prevSurahId;
            const surahName = surahNames[currentSurahId]
              ? `${currentSurahId}: ${surahNames[currentSurahId]}`
              : `Surah ${currentSurahId}`;
            return (
              <div key={ayah.key}>
              {showSurahDivider && isMultiSurah && (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-foreground/10" />
                  <span className="text-xs font-medium text-teal">{surahName}</span>
                  <div className="h-px flex-1 bg-foreground/10" />
                </div>
              )}
              <Card className={cn(
                'space-y-2 transition-all border',
                isAyahPlaying ? 'border-teal/30 bg-teal/5' : 'border-transparent'
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Audio visualizer / play indicator */}
                    <div className={cn('flex items-center justify-center', isAyahPlaying ? 'text-teal' : 'text-muted/40')}>
                      {isAyahPlaying && audio.isPlaying ? (
                        <div className="flex items-end gap-[2px] h-4">
                          <div className="w-[3px] bg-teal rounded-full animate-[bar1_0.8s_ease-in-out_infinite]" />
                          <div className="w-[3px] bg-teal rounded-full animate-[bar2_0.8s_ease-in-out_infinite_0.2s]" />
                          <div className="w-[3px] bg-teal rounded-full animate-[bar3_0.8s_ease-in-out_infinite_0.4s]" />
                        </div>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted">
                      {activeFlaggedAyahs.includes(ayah.number) && <span className={cn('mr-1 inline-block h-2 w-2 rounded-full', getFlagDotColor(ayah.number))} />}
                      {ayahLabel(ayah)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => playAyah(ayah, idx)}
                      className="rounded-full p-1.5 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
                      title="Play ayah"
                    >
                      <PlayIcon />
                    </button>
                    <button
                      onClick={() => togglePassageAyah(ayah.key)}
                      className="rounded-full p-1.5 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
                      title={isAyahRevealed ? 'Hide' : 'Reveal'}
                    >
                      {isAyahRevealed ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                {isAyahRevealed ? (
                  <>
                    <ArabicText ayah={ayah} className="text-center text-4xl leading-loose" />
                    {transliterationEnabled && ayah.transliteration && (
                      <p className="text-sm text-muted text-center">{ayah.transliteration}</p>
                    )}
                    {translationEnabled && ayah.translation && (
                      <p className="text-center text-sm italic text-muted">{ayah.translation}</p>
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
                  </>
                ) : (
                  <div className="py-4 text-center">
                    <p className="text-sm text-muted">Hidden — tap eye to reveal</p>
                  </div>
                )}
              </Card>
              </div>
            );
          })}
        </div>

        {/* Sticky media controls */}
        <div className="sticky bottom-16 rounded-2xl bg-card p-3 shadow-lg border border-foreground/10">
          <div className="flex items-center gap-3">
            {/* Play / Pause */}
            <button
              onClick={() => {
                if (playingAll && audio.isPlaying) audioController.pause();
                else if (playingAll && audio.isPaused) audioController.resume();
                else playAllAyahs();
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-teal text-white shadow-lg transition-transform hover:scale-105"
            >
              {playingAll && audio.isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="2" width="3.5" height="12" rx="1" />
                  <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
              )}
            </button>

            {/* Stop */}
            <button
              onClick={stopPlayback}
              disabled={!playingAll}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-30"
              title="Stop"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="1.5" />
              </svg>
            </button>

            {/* Status */}
            <div className="flex-1 text-center">
              <p className="text-xs text-muted">
                {playingAll
                  ? `Ayah ${currentPlayingAyahIdx + 1} / ${ayahs.length}`
                  : 'Tap play or ayah'}
              </p>
            </div>

            {/* Speed dropdown */}
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
                        onClick={() => handleSpeedChange(s)}
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

        {/* Finish button — show after all ayahs rated */}
        {allAyahsRated && (
          <Button onClick={() => finishSession()} className="w-full">
            See Results
          </Button>
        )}
        {!allAyahsRated && revealedAyahs.size > 0 && (
          <p className="text-center text-xs text-muted">
            Rate each revealed ayah to see results
          </p>
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
          <p className="text-[10px] text-muted">Shaky</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-red-500">{missedCount}</p>
          <p className="text-[10px] text-muted">Missed</p>
        </div>
      </div>


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
          <Button onClick={() => {
            // Restart with all ayahs, flagging the weak ones with their ratings
            const weakMap: Record<number, PracticeAyahRating> = {};
            for (const r of results) {
              if (r.rating !== 'got-it') weakMap[r.ayahNumber] = r.rating;
            }
            setFlaggedFromRetry(weakMap);
            setResults([]);
            setCurrentIdx(0);
            setPassageAyahRatings({});
            setRevealedAyahs(new Set());
            resetAyahState();
            setStep(initialStep);
          }} className="w-full">
            Retry with Weak Flagged
          </Button>
        )}
        <Button onClick={onDone} variant={hasWeakAyahs ? 'secondary' : 'primary'} className="w-full">
          Done
        </Button>
      </div>
    </div>
  );
}

// Small inline icons
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

function PlayIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" className="inline-block mr-1 -mt-0.5">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}



function EyeIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
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
