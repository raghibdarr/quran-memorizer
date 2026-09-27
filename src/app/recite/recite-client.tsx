'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LessonDef, Surah } from '@/types/quran';
import { getSurah, getSurahLessons } from '@/lib/quran-data';
import { useAppBack } from '@/hooks/use-app-back';
import PracticeSession from '@/components/practice/practice-session';
import CloseButton from '@/components/ui/close-button';
import SettingsPanel from '@/components/layout/settings-panel';
import { SkeletonRows } from '@/components/ui/skeleton';

/**
 * Recite a whole surah from memory (persona tests: someone who already knows a
 * surah shouldn't have to pick "lessons" in a Review tab to do this). Text starts
 * hidden; peek or hear any ayah; rating is optional and, when given, feeds the
 * same strength data as reviews.
 */
export default function ReciteClient() {
  const params = useSearchParams();
  const surahId = Number(params.get('s'));
  const [data, setData] = useState<{ surah: Surah; lessons: LessonDef[] } | null>(null);
  const close = useAppBack(Number.isFinite(surahId) && surahId > 0 ? `/lesson/${surahId}` : '/');

  useEffect(() => {
    if (!Number.isFinite(surahId) || surahId < 1 || surahId > 114) return;
    let live = true;
    Promise.all([getSurah(surahId), getSurahLessons(surahId)]).then(([surah, lessons]) => {
      if (live) setData({ surah, lessons });
    });
    return () => { live = false; };
  }, [surahId]);

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <CloseButton fallback={`/lesson/${surahId}`} label="Close recitation" />
          <span className="text-sm font-semibold text-teal">{data ? `Recite ${data.surah.nameSimple}` : 'Recite'}</span>
          <SettingsPanel />
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-5">
        {data ? (
          <PracticeSession
            surahIds={[data.surah.id]}
            title={data.surah.nameSimple}
            ayahs={data.surah.ayahs}
            lessonIds={data.lessons.map((l) => l.lessonId)}
            allLessonDefs={data.lessons}
            initialStep="full-passage"
            ratingOptional
            onDone={close}
          />
        ) : (
          <SkeletonRows count={5} />
        )}
      </main>
    </div>
  );
}
