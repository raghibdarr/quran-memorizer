'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Surah, Ayah, LessonDef } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import Button from '@/components/ui/button';
import { StarIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

interface CompletePhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonDef: LessonDef;
  totalLessons: number;
  onPracticeAgain: () => void;
}

export default function CompletePhase({ surah, ayahs, lessonDef, totalLessons, onPracticeAgain }: CompletePhaseProps) {
  const { completeLesson, resetLesson, getLesson } = useProgressStore();
  const { addCard, addLessonCard, cards } = useReviewStore();
  const { recordActivity, addAyahsMemorized } = useStatsStore();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Check which ayahs in this lesson are weak/shaky
  const weakAyahs = useMemo(() => {
    return ayahs.filter((a) => {
      const card = cards.find((c) => c.surahId === surah.id && c.ayahNumber === a.number);
      return card && card.lastQuality < 4;
    });
  }, [ayahs, cards, surah.id]);

  useEffect(() => {
    // Only count ayahs and record activity on first completion (not replays)
    const wasAlreadyComplete = getLesson(lessonDef.lessonId)?.completedAt != null;

    completeLesson(lessonDef.lessonId);
    ayahs.forEach((a) => addCard(surah.id, a.number));
    addLessonCard(lessonDef, surah.id);

    if (!wasAlreadyComplete) {
      recordActivity();
      addAyahsMemorized(ayahs.length);
    }
  }, [lessonDef.lessonId, surah.id]);

  const isMultiLesson = totalLessons > 1;
  const hasNextLesson = lessonDef.lessonNumber < totalLessons;
  const nextLessonUrl = `/lesson/${surah.id}/${lessonDef.lessonNumber + 1}`;
  const surahUrl = `/lesson/${surah.id}`;

  return (
    <div className="flex flex-col items-center space-y-6 py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
        <StarIcon size={36} className="text-success" />
      </div>

      <div>
        <h3 className="text-2xl font-bold text-foreground">Lesson Complete!</h3>
        <p className="mt-1 text-muted">
          {isMultiLesson
            ? `${surah.nameSimple} — Lesson ${lessonDef.lessonNumber} of ${totalLessons}`
            : `You've memorized ${surah.nameSimple}`}
        </p>
      </div>

      <div className="flex gap-6">
        <div>
          <p className="text-2xl font-bold text-teal">{ayahs.length}</p>
          <p className="text-xs text-muted">Ayahs learned</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gold">
            {ayahs.flatMap((a) => a.words).filter((w) => w.charType === 'word').length}
          </p>
          <p className="text-xs text-muted">Words reviewed</p>
        </div>
      </div>

      {weakAyahs.length > 0 ? (
        <div className="w-full rounded-xl bg-gold/5 border border-gold/20 p-4">
          <p className="text-sm font-medium text-gold">Some ayahs need review</p>
          <p className="mt-1 text-xs text-muted">
            {weakAyahs.map((a) => `Ayah ${a.number}`).join(', ')} — flagged in your{' '}
            <a href="/review" className="text-teal underline">Review</a> for follow-up.
          </p>
        </div>
      ) : (
        <div className="w-full rounded-xl bg-teal/5 p-4">
          <p className="text-sm text-teal">
            These ayahs will appear in your review to strengthen your memory.
          </p>
        </div>
      )}

      <div className="flex w-full flex-col gap-3">
        {hasNextLesson && (
          <a href={nextLessonUrl}>
            <Button className="w-full">
              Start Lesson {lessonDef.lessonNumber + 1}
            </Button>
          </a>
        )}

        {isMultiLesson && (
          <a href={surahUrl}>
            <Button variant={hasNextLesson ? 'secondary' : 'primary'} className="w-full">
              Back to {surah.nameSimple}
            </Button>
          </a>
        )}

        <button
          onClick={onPracticeAgain}
          className="w-full rounded-xl border-2 border-foreground/10 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5"
        >
          Revise This Lesson
        </button>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="w-full rounded-xl py-3 text-sm font-medium text-red-400/70 transition-colors hover:text-red-400"
        >
          Full Reset
        </button>

        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="mx-4 w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
              <h3 className="text-lg font-bold text-foreground">Reset Lesson?</h3>
              <p className="mt-2 text-sm text-muted">
                This will erase all progress for this lesson and restart from the Listen phase.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 rounded-xl border border-foreground/10 py-2.5 text-sm font-medium text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { resetLesson(lessonDef.lessonId, surah.id); setShowResetConfirm(false); }}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        <a href="/">
          <Button variant="ghost" className="w-full">Back to Home</Button>
        </a>
      </div>
    </div>
  );
}
