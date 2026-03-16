'use client';

import { useEffect, useState } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useStatsStore } from '@/stores/stats-store';
import { useReviewStore } from '@/stores/review-store';
import { getSurahIndex } from '@/lib/quran-data';
import { getSurahOrder } from '@/lib/curriculum';
import type { SurahMeta } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';

export default function ProgressPage() {
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const lessons = useProgressStore((s) => s.lessons);
  const stats = useStatsStore();
  const cards = useReviewStore((s) => s.cards);

  useEffect(() => {
    getSurahIndex().then((data) => {
      const sorted = [...data].sort(
        (a, b) => getSurahOrder(a.id) - getSurahOrder(b.id)
      );
      setSurahs(sorted);
    });
  }, []);

  const completedCount = Object.values(lessons).filter((l) => l.completedAt).length;

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="px-4 pt-6 pb-4">
        <div className="mx-auto max-w-lg">
          <h1 className="text-2xl font-bold text-foreground">Progress</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4">
        {/* Overview stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center">
            <p className="text-3xl font-bold text-teal">{stats.totalAyahsMemorized}</p>
            <p className="text-xs text-muted">Ayahs Memorized</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-gold">{stats.currentStreak}</p>
            <p className="text-xs text-muted">Day Streak</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-success">{completedCount}</p>
            <p className="text-xs text-muted">Surahs Complete</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-foreground">{cards.length}</p>
            <p className="text-xs text-muted">Review Cards</p>
          </Card>
        </div>

        {/* Longest streak */}
        {stats.longestStreak > 0 && (
          <Card>
            <p className="text-sm text-muted">Longest streak</p>
            <p className="text-lg font-bold text-gold">
              {stats.longestStreak} day{stats.longestStreak !== 1 ? 's' : ''}
            </p>
          </Card>
        )}

        {/* Per-surah progress */}
        <div>
          <h2 className="mb-3 text-lg font-bold text-foreground">Surah Progress</h2>
          <div className="space-y-2">
            {surahs.map((surah) => {
              const lesson = lessons[surah.id];
              const isComplete = lesson?.completedAt != null;
              const phase = lesson?.currentPhase ?? 'not started';
              const progress = isComplete
                ? 100
                : lesson
                ? ['listen', 'understand', 'chunk', 'test', 'complete'].indexOf(lesson.currentPhase) * 25
                : 0;

              return (
                <Card key={surah.id} className="flex items-center gap-3">
                  <span className="arabic-text text-lg">{surah.nameArabic}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{surah.nameSimple}</p>
                      <span className="text-xs capitalize text-muted">{phase}</span>
                    </div>
                    <ProgressBar
                      value={progress}
                      color={isComplete ? 'bg-success' : 'bg-teal'}
                      className="mt-1"
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
