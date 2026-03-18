'use client';

import { useEffect } from 'react';
import type { Surah, Ayah, LessonDef } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import Button from '@/components/ui/button';
import { StarIcon } from '@/components/ui/icons';

interface CompletePhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonDef: LessonDef;
  totalLessons: number;
  onPracticeAgain: () => void;
}

export default function CompletePhase({ surah, ayahs, lessonDef, totalLessons, onPracticeAgain }: CompletePhaseProps) {
  const { completeLesson, resetLesson } = useProgressStore();
  const { addCard } = useReviewStore();
  const { recordActivity, addAyahsMemorized } = useStatsStore();

  useEffect(() => {
    completeLesson(lessonDef.lessonId);
    // Add review cards for this lesson's ayahs only
    ayahs.forEach((a) => addCard(surah.id, a.number));
    recordActivity();
    addAyahsMemorized(ayahs.length);
  }, [lessonDef.lessonId, surah.id, ayahs, completeLesson, addCard, recordActivity, addAyahsMemorized]);

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

      <div className="w-full rounded-xl bg-teal/5 p-4">
        <p className="text-sm text-teal">
          These ayahs will appear in your review to strengthen your memory.
        </p>
      </div>

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
          Practice Again (Build & Test)
        </button>
        <button
          onClick={() => resetLesson(lessonDef.lessonId, surah.id)}
          className="w-full rounded-xl py-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          Full Reset
        </button>

        <a href="/">
          <Button variant="ghost" className="w-full">Back to Home</Button>
        </a>
      </div>
    </div>
  );
}
