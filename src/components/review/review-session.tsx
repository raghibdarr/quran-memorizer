'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LessonReviewCard, Surah, Ayah } from '@/types/quran';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { useAudio } from '@/hooks/use-audio';
import { useSettingsStore } from '@/stores/settings-store';
import { audioController } from '@/lib/audio';
import { getAudioUrl as buildAudioUrl, getSurah } from '@/lib/quran-data';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ReviewSessionProps {
  dueCards: LessonReviewCard[];
  onComplete: () => void;
}

type AyahRating = 'got-it' | 'hesitated' | 'missed';

function ratingToQuality(rating: AyahRating): number {
  switch (rating) {
    case 'got-it': return 5;
    case 'hesitated': return 3;
    case 'missed': return 1;
  }
}

interface LessonData {
  surah: Surah;
  ayahs: Ayah[];
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

function formatNextReview(timestamp: number): string {
  const days = Math.round((timestamp - Date.now()) / 86_400_000);
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 14) return 'in about a week';
  if (days < 30) return `in ${Math.round(days / 7)} weeks`;
  return `in about ${Math.round(days / 30)} month${Math.round(days / 30) !== 1 ? 's' : ''}`;
}

export default function ReviewSession({ dueCards, onComplete }: ReviewSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [hiddenAyahs, setHiddenAyahs] = useState<Set<number>>(new Set());
  const [ayahRatings, setAyahRatings] = useState<Record<number, AyahRating>>({});
  const [submitted, setSubmitted] = useState(false);
  const [lessonData, setLessonData] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);

  // Audio state
  const { isPlaying, isPaused, setSpeed } = useAudio();
  const [currentAyahIndex, setCurrentAyahIndex] = useState(-1);
  const [playingAll, setPlayingAll] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(() => audioController.speed);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const abortRef = useRef(false);
  const ayahRefs = useRef<(HTMLElement | null)[]>([]);

  const getAudioUrl = (surahId: number, ayahNum: number) =>
    buildAudioUrl(surahId, ayahNum, useSettingsStore.getState().reciter);

  const reviewLessonCard = useReviewStore((s) => s.reviewLessonCard);
  const reviewAyahCard = useReviewStore((s) => s.reviewCard);
  const lessonCardsAll = useReviewStore((s) => s.lessonCards);
  const recordActivity = useStatsStore((s) => s.recordActivity);

  const currentCard = dueCards[currentIndex];
  const isLastCard = currentIndex === dueCards.length - 1;

  // Load surah data for current card
  useEffect(() => {
    if (!currentCard) return;
    setLoading(true);
    getSurah(currentCard.surahId).then((surah) => {
      const ayahs = surah.ayahs.filter(
        (a) => a.number >= currentCard.ayahStart && a.number <= currentCard.ayahEnd
      );
      setLessonData({ surah, ayahs });
      setLoading(false);
    });
  }, [currentCard]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => { abortRef.current = true; audioController.stop(); };
  }, []);

  // Autoscroll to current ayah
  useEffect(() => {
    if (currentAyahIndex >= 0 && ayahRefs.current[currentAyahIndex]) {
      ayahRefs.current[currentAyahIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentAyahIndex]);

  const allRated = lessonData ? lessonData.ayahs.every((a) => ayahRatings[a.number]) : false;

  // --- Audio controls (same pattern as listen-phase) ---

  const playAllAyahs = useCallback(async () => {
    if (!lessonData || playingAll) return;
    abortRef.current = false;
    setPlayingAll(true);

    for (let i = 0; i < lessonData.ayahs.length; i++) {
      if (abortRef.current) break;
      setCurrentAyahIndex(i);
      await audioController.playAndWait(getAudioUrl(lessonData.surah.id, lessonData.ayahs[i].number));
      if (!abortRef.current && i < lessonData.ayahs.length - 1) {
        await new Promise<void>((r) => setTimeout(r, 400));
      }
    }

    setCurrentAyahIndex(-1);
    setPlayingAll(false);
  }, [lessonData, playingAll]);

  const stopPlayback = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
    setCurrentAyahIndex(-1);
  }, []);

  const restartPlayback = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
    setCurrentAyahIndex(-1);
    setTimeout(() => { playAllAyahs(); }, 100);
  }, [playAllAyahs]);

  const playSingleAyah = useCallback(async (index: number) => {
    if (!lessonData || playingAll) return;
    setCurrentAyahIndex(index);
    await audioController.playAndWait(getAudioUrl(lessonData.surah.id, lessonData.ayahs[index].number));
    setCurrentAyahIndex(-1);
  }, [lessonData, playingAll]);

  const handleSpeedChange = (speed: number) => {
    setCurrentSpeed(speed);
    setSpeed(speed);
    setShowSpeedMenu(false);
  };

  // --- Rating & submission ---

  const rateAyah = useCallback((ayahNumber: number, rating: AyahRating) => {
    setAyahRatings((prev) => ({ ...prev, [ayahNumber]: rating }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!lessonData) return;

    for (const ayah of lessonData.ayahs) {
      const rating = ayahRatings[ayah.number];
      if (rating) {
        reviewAyahCard(currentCard.surahId, ayah.number, ratingToQuality(rating));
      }
    }

    const qualities = lessonData.ayahs.map((a) => ratingToQuality(ayahRatings[a.number] ?? 'missed'));
    const worstQuality = Math.min(...qualities);
    reviewLessonCard(currentCard.lessonId, worstQuality);

    recordActivity();
    stopPlayback();
    setSubmitted(true);
  }, [lessonData, ayahRatings, currentCard, reviewAyahCard, reviewLessonCard, recordActivity, stopPlayback]);

  const handleNext = useCallback(() => {
    if (isLastCard) {
      onComplete();
    } else {
      setCurrentIndex((i) => i + 1);
      setRevealed(false);
      setAyahRatings({});
      setSubmitted(false);
      setCurrentAyahIndex(-1);
      setPlayingAll(false);
    }
  }, [isLastCard, onComplete]);

  if (!currentCard || loading || !lessonData) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    );
  }

  // After submit, read the updated lesson card to get the actual next review date
  const updatedCard = lessonCardsAll.find((c) => c.lessonId === currentCard?.lessonId);

  const worstRating = submitted
    ? lessonData.ayahs.reduce((worst, a) => {
        const r = ayahRatings[a.number];
        if (r === 'missed') return 'missed';
        if (r === 'hesitated' && worst !== 'missed') return 'hesitated';
        return worst;
      }, 'got-it' as AyahRating)
    : null;

  const nextReviewLabel = submitted && updatedCard
    ? formatNextReview(updatedCard.nextReview)
    : '';

  return (
    <div className="space-y-5">
      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="bg-teal transition-all duration-300"
              style={{ width: `${((currentIndex + (submitted ? 1 : 0)) / dueCards.length) * 100}%` }}
            />
          </div>
        </div>
        <span className="text-xs font-medium text-muted">
          {currentIndex + 1} / {dueCards.length}
        </span>
      </div>

      {/* Lesson info */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-foreground">
          {lessonData.surah.nameSimple}
        </h3>
        <p className="text-sm text-muted">
          Lesson {currentCard.lessonNumber} — Ayahs {currentCard.ayahStart}–{currentCard.ayahEnd}
        </p>
        <span className="arabic-text text-xl text-muted/60">{lessonData.surah.nameArabic}</span>
      </div>

      {/* Recite prompt */}
      {!revealed && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-card p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">
              Recite this passage from memory
            </p>
            <p className="mt-1 text-xs text-muted">
              Try to recall the full passage, then rate how well you remembered each ayah
            </p>
          </div>

          <Button onClick={() => {
            setRevealed(true);
            setHiddenAyahs(new Set(lessonData.ayahs.map((a) => a.number)));
          }} className="w-full">
            I've Recited — Rate My Recall
          </Button>
        </div>
      )}

      {/* Revealed — ayah cards with play + rating */}
      {revealed && (
        <div className="space-y-3">
          {/* Hide All / Show All toggle */}
          {!submitted && (
            <button
              onClick={() => {
                if (hiddenAyahs.size === 0) {
                  setHiddenAyahs(new Set(lessonData.ayahs.map((a) => a.number)));
                } else {
                  setHiddenAyahs(new Set());
                }
              }}
              className="w-full rounded-lg bg-foreground/5 py-2 text-xs font-medium text-muted hover:bg-foreground/10"
            >
              {hiddenAyahs.size === 0 ? 'Hide All' : 'Show All'}
            </button>
          )}

          {/* Ayah cards — tappable to play, with visualizer and rating */}
          {lessonData.ayahs.map((ayah, i) => {
            const isActive = i === currentAyahIndex;
            const rating = ayahRatings[ayah.number];
            const isHidden = hiddenAyahs.has(ayah.number);

            return (
              <div
                key={ayah.key}
                ref={(el) => { ayahRefs.current[i] = el; }}
                className={cn(
                  'rounded-xl p-4 transition-all border relative',
                  isActive
                    ? 'bg-teal/5 border-teal/30 shadow-md'
                    : 'bg-card border-foreground/8',
                  playingAll && !isActive && 'opacity-40'
                )}
              >
                {/* Play indicator — tap to play individual ayah */}
                <button
                  onClick={() => playSingleAyah(i)}
                  disabled={playingAll}
                  className={cn(
                    'absolute top-3 left-3 flex items-center justify-center',
                    isActive ? 'text-teal' : 'text-muted/40'
                  )}
                >
                  {isActive && isPlaying ? (
                    <div className="flex items-end gap-[2px] h-4">
                      <div className="w-[3px] bg-teal rounded-full animate-[bar1_0.8s_ease-in-out_infinite]" />
                      <div className="w-[3px] bg-teal rounded-full animate-[bar2_0.8s_ease-in-out_infinite_0.2s]" />
                      <div className="w-[3px] bg-teal rounded-full animate-[bar3_0.8s_ease-in-out_infinite_0.4s]" />
                    </div>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 2l10 6-10 6V2z" />
                    </svg>
                  )}
                </button>

                {/* Eye toggle — hide/reveal */}
                {!submitted && (
                  <button
                    onClick={() => setHiddenAyahs((prev) => {
                      const next = new Set(prev);
                      if (next.has(ayah.number)) next.delete(ayah.number);
                      else next.add(ayah.number);
                      return next;
                    })}
                    className="absolute top-3 right-3 text-muted/40 hover:text-muted"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {isHidden ? (
                        <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                      ) : (
                        <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                      )}
                    </svg>
                  </button>
                )}

                {isHidden && !submitted ? (
                  <div className="py-4 text-center">
                    <p className="text-sm text-muted">Hidden — tap eye to reveal</p>
                  </div>
                ) : (
                  <AyahDisplay ayah={ayah} />
                )}

                {/* Per-ayah rating buttons */}
                {!submitted && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => rateAyah(ayah.number, 'got-it')}
                      className={cn(
                        'flex-1 rounded-lg py-2 text-xs font-semibold transition-colors',
                        rating === 'got-it'
                          ? 'bg-success text-white'
                          : 'bg-success/10 text-success hover:bg-success/20'
                      )}
                    >
                      Got it
                    </button>
                    <button
                      onClick={() => rateAyah(ayah.number, 'hesitated')}
                      className={cn(
                        'flex-1 rounded-lg py-2 text-xs font-semibold transition-colors',
                        rating === 'hesitated'
                          ? 'bg-gold text-white'
                          : 'bg-gold/10 text-gold hover:bg-gold/20'
                      )}
                    >
                      Hesitated
                    </button>
                    <button
                      onClick={() => rateAyah(ayah.number, 'missed')}
                      className={cn(
                        'flex-1 rounded-lg py-2 text-xs font-semibold transition-colors',
                        rating === 'missed'
                          ? 'bg-red-500 text-white'
                          : 'bg-red-400/10 text-red-400 hover:bg-red-400/20'
                      )}
                    >
                      Missed
                    </button>
                  </div>
                )}

                {/* Show rating after submit */}
                {submitted && rating && (
                  <div className={cn(
                    'mt-2 rounded-lg px-3 py-1 text-center text-xs font-medium',
                    rating === 'got-it' && 'bg-success/10 text-success',
                    rating === 'hesitated' && 'bg-gold/10 text-gold',
                    rating === 'missed' && 'bg-red-400/10 text-red-400',
                  )}>
                    {rating === 'got-it' ? 'Got it' : rating === 'hesitated' ? 'Hesitated' : 'Missed'}
                  </div>
                )}
              </div>
            );
          })}

          {/* Media controls bar — same as listen-phase */}
          {!submitted && (
            <div className="sticky bottom-16 rounded-2xl bg-card p-3 shadow-lg border border-foreground/10">
              <div className="flex items-center gap-3">
                {/* Restart */}
                <button
                  onClick={restartPlayback}
                  disabled={!playingAll}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-30"
                  title="Restart from beginning"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                </button>

                {/* Play / Pause */}
                <button
                  onClick={() => {
                    if (playingAll && isPlaying) audioController.pause();
                    else if (playingAll && isPaused) audioController.resume();
                    else playAllAyahs();
                  }}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-teal text-white shadow-lg transition-transform hover:scale-105"
                >
                  {playingAll && isPlaying ? (
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
                      ? `Ayah ${currentAyahIndex + 1} / ${lessonData.ayahs.length}`
                      : 'Tap ayah or play'}
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
                        {SPEEDS.map((s) => (
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
          )}

          {/* Submit / Next buttons */}
          {!submitted && (
            <Button
              onClick={handleSubmit}
              disabled={!allRated}
              className="w-full"
            >
              {allRated ? 'Submit Review' : `Rate all ${lessonData.ayahs.length} ayahs to continue`}
            </Button>
          )}

          {submitted && (
            <div className="space-y-3">
              <div className={cn(
                'rounded-xl p-3 text-center text-sm font-medium',
                worstRating === 'got-it' && 'bg-success/10 text-success',
                worstRating === 'hesitated' && 'bg-gold/10 text-gold',
                worstRating === 'missed' && 'bg-red-400/10 text-red-400',
              )}>
                {worstRating === 'got-it' && `Great recall! Next review ${nextReviewLabel}.`}
                {worstRating === 'hesitated' && `Good effort — next review ${nextReviewLabel}.`}
                {worstRating === 'missed' && `No worries — next review ${nextReviewLabel}.`}
              </div>
              <Button onClick={handleNext} className="w-full">
                {isLastCard ? 'Finish Review' : 'Next Lesson'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
