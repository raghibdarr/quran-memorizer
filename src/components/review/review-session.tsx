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
import BeadProgress from '@/components/ui/bead-progress';
import Button from '@/components/ui/button';
import MediaControlsBar from '@/components/ui/media-controls-bar';
import RatingButtons from '@/components/ui/rating-buttons';
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
  const { isPlaying } = useAudio();
  const [currentAyahIndex, setCurrentAyahIndex] = useState(-1);
  const [playingAll, setPlayingAll] = useState(false);
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
      {/* Progress — card counter pill + beads */}
      <div className="flex items-center justify-between gap-3">
        <span className="ink-border flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-foreground">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="7" width="15" height="13" rx="2" />
            <path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-1" />
          </svg>
          Card {currentIndex + 1} of {dueCards.length}
        </span>
        <BeadProgress
          total={dueCards.length}
          filled={currentIndex + (submitted ? 1 : 0)}
          size="sm"
          className="flex-1 justify-end"
        />
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

      {/* Recite prompt — top card of the deck */}
      {!revealed && (
        <div className="space-y-5">
          <div className="relative">
            {/* Stack edges — the rest of the deck behind */}
            <div className="absolute inset-0 translate-x-[10px] translate-y-[10px] rotate-[1.2deg] rounded-2xl border-[1.5px] border-ink/40 bg-cream" aria-hidden />
            <div className="absolute inset-0 translate-x-[5px] translate-y-[5px] rotate-[-0.8deg] rounded-2xl border-[1.5px] border-ink/60 bg-card-raised" aria-hidden />
            <div className="tactile-card relative rounded-2xl bg-card p-6 text-center">
              <div className="mx-auto mb-3 flex items-center gap-2.5" style={{ width: 'fit-content' }} aria-hidden>
                <span className="h-px w-10 bg-gold/50" />
                <span className="h-2 w-2 rotate-45 bg-gold" />
                <span className="h-px w-10 bg-gold/50" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Recite this passage from memory
              </p>
              <p className="mt-1 text-xs text-muted">
                Try to recall the full passage, then rate how well you remembered each ayah
              </p>
            </div>
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
              className="pressable w-full rounded-lg border border-foreground/15 bg-card py-2.5 text-xs font-semibold text-muted hover:text-foreground"
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
                  'tactile-raise-sm relative rounded-xl border-[1.5px] p-4 transition-all',
                  isActive
                    ? 'border-teal/60 bg-teal/5'
                    : 'border-ink bg-card',
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
                  <>
                    <div className="mx-auto mb-3 mt-5 flex w-fit items-center gap-2.5" aria-hidden>
                      <span className="h-px w-8 bg-gold/50" />
                      <span className="h-1.5 w-1.5 rotate-45 bg-gold" />
                      <span className="h-px w-8 bg-gold/50" />
                    </div>
                    <AyahDisplay ayah={ayah} />
                  </>
                )}

                {/* Per-ayah rating buttons */}
                {!submitted && (
                  <RatingButtons
                    className="mt-3"
                    size="sm"
                    value={rating}
                    onRate={(r) => rateAyah(ayah.number, r)}
                  />
                )}

                {/* Show rating after submit */}
                {submitted && rating && (
                  <div className={cn(
                    'mt-2 rounded-lg border px-3 py-1 text-center text-xs font-medium',
                    rating === 'got-it' && 'border-success/30 bg-success/10 text-success',
                    rating === 'hesitated' && 'border-gold/30 bg-gold/10 text-gold-deep',
                    rating === 'missed' && 'border-miss/30 bg-miss/10 text-miss',
                  )}>
                    {rating === 'got-it' ? 'Got it' : rating === 'hesitated' ? 'Hesitated' : 'Missed'}
                  </div>
                )}
              </div>
            );
          })}

          {/* Media controls */}
          {!submitted && (
            <MediaControlsBar
              playingAll={playingAll}
              currentIdx={currentAyahIndex}
              total={lessonData.ayahs.length}
              idleLabel="Tap ayah or play"
              onPlayAll={playAllAyahs}
              onStop={stopPlayback}
              onRestart={restartPlayback}
            />
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
                'rounded-xl border-[1.5px] p-3 text-center text-sm font-medium',
                worstRating === 'got-it' && 'border-success/30 bg-success/10 text-success',
                worstRating === 'hesitated' && 'border-gold/30 bg-gold/10 text-gold-deep',
                worstRating === 'missed' && 'border-miss/30 bg-miss/10 text-miss',
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
