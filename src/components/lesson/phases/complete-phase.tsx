'use client';

import { useEffect } from 'react';
import type { Surah } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import Button from '@/components/ui/button';
import { getNextSurah } from '@/lib/curriculum';

interface CompletePhaseProps {
  surah: Surah;
}

export default function CompletePhase({ surah }: CompletePhaseProps) {
  const { completeLesson, getCompletedSurahIds, resetLesson, restartPractice } = useProgressStore();
  const { addCardsForSurah } = useReviewStore();
  const { recordActivity, addAyahsMemorized } = useStatsStore();

  useEffect(() => {
    completeLesson(surah.id);
    addCardsForSurah(surah.id, surah.versesCount);
    recordActivity();
    addAyahsMemorized(surah.versesCount);
  }, [surah.id, surah.versesCount, completeLesson, addCardsForSurah, recordActivity, addAyahsMemorized]);

  const completedIds = getCompletedSurahIds();
  const nextSurahId = getNextSurah(completedIds);

  return (
    <div className="flex flex-col items-center space-y-6 py-8 text-center">
      {/* Celebration */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
        <span className="text-4xl">&#9734;</span>
      </div>

      <div>
        <h3 className="text-2xl font-bold text-foreground">Lesson Complete!</h3>
        <p className="mt-1 text-muted">
          You've memorized {surah.nameSimple}
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-6">
        <div>
          <p className="text-2xl font-bold text-teal">{surah.versesCount}</p>
          <p className="text-xs text-muted">Ayahs learned</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gold">
            {surah.ayahs.flatMap((a) => a.words).filter((w) => w.charType === 'word').length}
          </p>
          <p className="text-xs text-muted">Words reviewed</p>
        </div>
      </div>

      {/* Review reminder */}
      <div className="w-full rounded-xl bg-teal/5 p-4">
        <p className="text-sm text-teal">
          These ayahs will appear in your review tomorrow to strengthen your memory.
        </p>
      </div>

      {/* Actions */}
      <div className="flex w-full flex-col gap-3">
        {nextSurahId && (
          <a href={`/lesson/${nextSurahId}`}>
            <Button className="w-full">Start Next Surah</Button>
          </a>
        )}

        {/* Restart options */}
        <button
          onClick={() => restartPractice(surah.id)}
          className="w-full rounded-xl border-2 border-foreground/10 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5"
        >
          Practice Again (Build & Test)
        </button>
        <button
          onClick={() => resetLesson(surah.id)}
          className="w-full rounded-xl py-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          Full Reset (Start Over)
        </button>

        <a href="/">
          <Button variant="ghost" className="w-full">
            Back to Home
          </Button>
        </a>
      </div>
    </div>
  );
}
