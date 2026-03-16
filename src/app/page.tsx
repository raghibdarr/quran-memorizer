'use client';

import { useEffect, useState } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { getSurahIndex } from '@/lib/quran-data';
import { CURRICULUM_ORDER, getSurahOrder } from '@/lib/curriculum';
import type { SurahMeta } from '@/types/quran';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import { cn } from '@/lib/cn';

export default function HomePage() {
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const lessons = useProgressStore((s) => s.lessons);
  const dueCount = useReviewStore((s) => s.getDueCount());
  const stats = useStatsStore();

  useEffect(() => {
    getSurahIndex().then((data) => {
      const sorted = [...data].sort(
        (a, b) => getSurahOrder(a.id) - getSurahOrder(b.id)
      );
      setSurahs(sorted);
    });
  }, []);

  // Find active lesson (started but not completed)
  const activeLesson = Object.values(lessons).find(
    (l) => l.completedAt === null
  );

  const activeSurah = activeLesson
    ? surahs.find((s) => s.id === activeLesson.surahId)
    : null;

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* Header */}
      <header className="px-4 pt-6 pb-2">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-teal">HifzFlow</h1>
              <p className="text-sm text-muted">Quran Memorization</p>
            </div>
            {stats.currentStreak > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1.5">
                <span className="text-sm">&#128293;</span>
                <span className="text-sm font-bold text-gold">
                  {stats.currentStreak}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {/* Review Banner */}
        {dueCount > 0 && (
          <a href="/review">
            <Card className="border-l-4 border-l-gold bg-gold/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">
                    {dueCount} ayah{dueCount !== 1 ? 's' : ''} due for review
                  </p>
                  <p className="text-sm text-muted">
                    Keep your memorization strong
                  </p>
                </div>
                <span className="text-2xl">&#128218;</span>
              </div>
            </Card>
          </a>
        )}

        {/* Continue Lesson */}
        {activeLesson && activeSurah && (
          <a href={`/lesson/${activeLesson.surahId}`}>
            <Card className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Continue Learning
              </p>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {activeSurah.nameSimple}
                  </p>
                  <p className="text-sm capitalize text-teal">
                    {activeLesson.currentPhase} phase
                  </p>
                </div>
                <span className="arabic-text text-2xl text-muted">
                  {activeSurah.nameArabic}
                </span>
              </div>
            </Card>
          </a>
        )}

        {/* Stats row */}
        <div className="flex gap-3">
          <Card className="flex-1 text-center">
            <p className="text-xl font-bold text-teal">
              {stats.totalAyahsMemorized}
            </p>
            <p className="text-xs text-muted">Ayahs</p>
          </Card>
          <Card className="flex-1 text-center">
            <p className="text-xl font-bold text-gold">
              {stats.currentStreak}
            </p>
            <p className="text-xs text-muted">Day Streak</p>
          </Card>
          <Card className="flex-1 text-center">
            <p className="text-xl font-bold text-success">
              {Object.values(lessons).filter((l) => l.completedAt).length}
            </p>
            <p className="text-xs text-muted">Surahs</p>
          </Card>
        </div>

        {/* Surah Grid */}
        <div>
          <h2 className="mb-3 text-lg font-bold text-foreground">Surahs</h2>
          <div className="grid grid-cols-2 gap-3">
            {surahs.map((surah) => {
              const lesson = lessons[surah.id];
              const isComplete = lesson?.completedAt !== null && lesson?.completedAt !== undefined;
              const isActive = lesson && !isComplete;
              const phaseProgress = isActive
                ? ['listen', 'understand', 'chunk', 'test', 'complete'].indexOf(lesson.currentPhase) * 25
                : isComplete
                ? 100
                : 0;

              return (
                <a key={surah.id} href={`/lesson/${surah.id}`}>
                  <Card
                    className={cn(
                      'transition-all hover:shadow-md',
                      isComplete && 'border border-success/20 bg-success/5'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <span className="arabic-text text-xl">{surah.nameArabic}</span>
                      {isComplete && (
                        <span className="text-success text-sm">&#10003;</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {surah.nameSimple}
                    </p>
                    <p className="text-xs text-muted">
                      {surah.versesCount} ayahs &middot; {surah.nameTranslation}
                    </p>
                    {(isActive || isComplete) && (
                      <ProgressBar value={phaseProgress} className="mt-2" />
                    )}
                  </Card>
                </a>
              );
            })}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
