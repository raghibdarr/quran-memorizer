'use client';

import { useEffect, useMemo, useState } from 'react';
import type { JuzMeta, SurahMeta } from '@/types/quran';
import { usePlanStore } from '@/stores/plan-store';
import { useProgressStore } from '@/stores/progress-store';
import { getJuzIndex, getSurahIndex } from '@/lib/quran-data';
import { computePlanProgress, getPlanLessons } from '@/lib/plan';
import Button from '@/components/ui/button';
import { StarIcon } from '@/components/ui/icons';

export default function PlanCelebration() {
  const plan = usePlanStore((s) => s.plan);
  const markFinishCelebrated = usePlanStore((s) => s.markFinishCelebrated);
  const progressLessons = useProgressStore((s) => s.lessons);

  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);

  useEffect(() => {
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, []);

  const progress = useMemo(() => {
    if (!plan || !allSurahs.length || !juzIndex.length) return null;
    const lessons = getPlanLessons(plan, allSurahs, juzIndex);
    if (lessons.length === 0) return null;
    return computePlanProgress(plan, lessons, progressLessons);
  }, [plan, allSurahs, juzIndex, progressLessons]);

  if (!plan || !progress) return null;
  if (progress.percentage < 100) return null;
  if (plan.finishCelebrated) return null;

  const goalLabel =
    plan.goalType === 'full-quran'
      ? 'the full Quran'
      : plan.goalType === 'juz'
        ? plan.goalJuzNumbers.length === 1
          ? `Juz ${plan.goalJuzNumbers[0]}`
          : `${plan.goalJuzNumbers.length} juz`
        : `${plan.goalSurahIds.length} surah${plan.goalSurahIds.length === 1 ? '' : 's'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-xl">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold/15">
          <StarIcon size={44} className="text-gold" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-teal">Alhamdulillah</h2>
        <p className="mt-2 text-sm text-foreground">
          You&apos;ve completed your plan — {goalLabel}.
        </p>
        <p className="mt-1 text-xs text-muted">
          {progress.totalLessons} lesson{progress.totalLessons === 1 ? '' : 's'} memorized.
          Reviews will continue to keep your memorization strong.
        </p>
        <Button className="mt-5 w-full" onClick={() => markFinishCelebrated()}>
          Continue
        </Button>
      </div>
    </div>
  );
}
