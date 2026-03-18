'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSurah } from '@/lib/quran-data';
import { generateLessons } from '@/lib/curriculum';
import { useProgressStore } from '@/stores/progress-store';
import type { Surah, LessonDef } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export default function SurahDetailPage() {
  const params = useParams();
  const surahId = parseInt(params.surahId as string, 10);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [lessons, setLessons] = useState<LessonDef[]>([]);
  const progressLessons = useProgressStore((s) => s.lessons);

  useEffect(() => {
    getSurah(surahId).then((s) => {
      setSurah(s);
      setLessons(generateLessons(surahId, s.versesCount));
    });
  }, [surahId]);

  if (!surah) return null;

  // Auto-redirect for single-lesson surahs
  if (lessons.length === 1) {
    if (typeof window !== 'undefined') {
      window.location.href = `/lesson/${surahId}/1`;
    }
    return null;
  }

  const completedCount = lessons.filter(
    (l) => progressLessons[l.lessonId]?.completedAt != null
  ).length;
  const overallProgress = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* Header */}
      <header className="px-4 pt-6 pb-4 border-b border-foreground/5">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <a href="/" className="text-sm text-muted hover:text-foreground">← Back</a>
            <SettingsPanel />
          </div>
          <div className="mt-4 text-center">
            <p className="arabic-text text-3xl">{surah.nameArabic}</p>
            <h1 className="mt-1 text-xl font-bold text-foreground">{surah.nameSimple}</h1>
            <p className="text-sm text-muted">
              {surah.nameTranslation} &middot; {surah.versesCount} ayahs &middot; {lessons.length} lessons
            </p>
          </div>
          <div className="mt-3">
            <ProgressBar value={overallProgress} />
            <p className="mt-1 text-center text-xs text-muted">
              {completedCount} / {lessons.length} lessons completed
            </p>
          </div>
        </div>
      </header>

      {/* Lesson list */}
      <main className="mx-auto max-w-2xl px-4 py-4">
        <div className="space-y-2">
          {lessons.map((lesson) => {
            const progress = progressLessons[lesson.lessonId];
            const isComplete = progress?.completedAt != null;
            const isActive = progress && !isComplete;
            const phaseProgress = isActive
              ? ['listen', 'understand', 'chunk', 'test', 'complete'].indexOf(progress.currentPhase) * 25
              : isComplete ? 100 : 0;

            return (
              <a key={lesson.lessonId} href={`/lesson/${surahId}/${lesson.lessonNumber}`} className="block">
                <Card
                  className={cn(
                    'flex items-center gap-4 transition-all hover:shadow-md',
                    isComplete && 'border border-success/20 bg-success/5'
                  )}
                >
                  {/* Lesson number */}
                  <div
                    className={cn(
                      'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold',
                      isComplete ? 'bg-success text-white' :
                      isActive ? 'bg-teal text-white' :
                      'bg-foreground/10 text-muted'
                    )}
                  >
                    {isComplete ? <CheckIcon size={16} /> : lesson.lessonNumber}
                  </div>

                  {/* Lesson info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Lesson {lesson.lessonNumber}
                    </p>
                    <p className="text-xs text-muted">
                      Ayahs {lesson.ayahStart}–{lesson.ayahEnd}
                    </p>
                    {isActive && (
                      <div className="mt-1.5">
                        <ProgressBar value={phaseProgress} className="h-1" />
                        <p className="mt-0.5 text-[10px] capitalize text-teal">
                          {progress.currentPhase} phase
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              </a>
            );
          })}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
