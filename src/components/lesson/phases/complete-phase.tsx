'use client';

import Link from '@/components/app-link';

import { useEffect, useMemo, useState } from 'react';
import type { Surah, Ayah, LessonDef } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { usePlanStore } from '@/stores/plan-store';
import Button from '@/components/ui/button';
import { StarIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { lessonHref } from '@/lib/routes';
import { useTodaysPlan } from '@/hooks/use-todays-plan';
import { DayCompleteSummary } from '@/components/plan/day-complete';
import ConfirmSheet from '@/components/ui/confirm-sheet';
import { haptic } from '@/lib/haptics';

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
  const markPlanLessonCompleted = usePlanStore((s) => s.markLessonCompleted);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const { plan, dayStatus } = useTodaysPlan();

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
    markPlanLessonCompleted(lessonDef.lessonId);
    haptic.success();

    if (!wasAlreadyComplete) {
      recordActivity();
      addAyahsMemorized(ayahs.length);
    }
  }, [lessonDef.lessonId, surah.id]);

  const isMultiLesson = totalLessons > 1;
  const hasNextLesson = lessonDef.lessonNumber < totalLessons;
  const nextLessonUrl = lessonHref(surah.id, lessonDef.lessonNumber + 1);
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

      {/* Plan-aware close (M6): ties this lesson to today's plan, the streak and the goal */}
      {plan && dayStatus.mode === 'plan' && (
        dayStatus.complete ? (
          <div className="w-full rounded-xl border border-success/25 bg-success/5 p-4">
            <p className="text-sm font-bold text-success">That&apos;s your plan done for today</p>
            <div className="mt-2">
              <DayCompleteSummary />
            </div>
          </div>
        ) : dayStatus.remaining > 0 ? (
          <Link href="/" className="w-full rounded-xl border border-teal/20 bg-teal/5 p-3 text-sm font-medium text-teal">
            {dayStatus.remaining} more {dayStatus.remaining === 1 ? 'item' : 'items'} on today&apos;s plan →
          </Link>
        ) : null
      )}

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
            <Link href="/review" className="text-teal underline">Review</Link> for follow-up.
          </p>
        </div>
      ) : (
        <div className="w-full rounded-xl bg-teal/5 p-4">
          <p className="text-sm text-teal">
            These ayahs will appear in your review to strengthen your memory.
          </p>
        </div>
      )}

      {!hasNextLesson && (
        <div className="w-full rounded-xl border border-teal/15 bg-teal/5 p-4 text-center">
          <p className="text-sm font-semibold text-teal">Use this in your next prayer</p>
          <p className="mt-1 text-xs text-muted">
            Reciting {surah.nameSimple} during salah is the best way to solidify what you&apos;ve memorized.
          </p>
        </div>
      )}

      <div className="flex w-full flex-col gap-3">
        {hasNextLesson && (
          <Link href={nextLessonUrl}>
            <Button className="w-full">
              Start Lesson {lessonDef.lessonNumber + 1}
            </Button>
          </Link>
        )}

        {isMultiLesson && (
          <Link href={surahUrl}>
            <Button variant={hasNextLesson ? 'secondary' : 'primary'} className="w-full">
              Back to {surah.nameSimple}
            </Button>
          </Link>
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
          Start lesson over
        </button>

        <ConfirmSheet
          open={showResetConfirm}
          title="Start this lesson over?"
          message="You'll go back to Listen, and this lesson won't count as done until you finish it again. Your reviews and streak aren't affected."
          confirmLabel="Start over"
          destructive
          onConfirm={() => { resetLesson(lessonDef.lessonId, surah.id); setShowResetConfirm(false); }}
          onCancel={() => setShowResetConfirm(false)}
        />

        <Link href="/">
          <Button variant="ghost" className="w-full">Back to Home</Button>
        </Link>
      </div>
    </div>
  );
}
