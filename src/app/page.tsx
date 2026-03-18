'use client';

import { useEffect, useState } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { getSurahIndex } from '@/lib/quran-data';
import { CURRICULUM_ORDER, getSurahOrder, generateLessons } from '@/lib/curriculum';
import type { SurahMeta } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import { FlameIcon, BookIcon, CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export default function HomePage() {
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const progressLessons = useProgressStore((s) => s.lessons);
  const cards = useReviewStore((s) => s.cards);
  const dueCount = cards.filter((c) => c.nextReview <= Date.now()).length;
  const stats = useStatsStore();

  useEffect(() => {
    getSurahIndex().then((data) => {
      const sorted = [...data].sort(
        (a, b) => getSurahOrder(a.id) - getSurahOrder(b.id)
      );
      setSurahs(sorted);
    });
  }, []);

  // Find active lesson (any in-progress lesson)
  const activeProgress = Object.values(progressLessons).find(
    (l) => l.completedAt === null
  );
  const activeSurah = activeProgress
    ? surahs.find((s) => s.id === activeProgress.surahId)
    : null;

  // Count completed surahs (all lessons done)
  const completedSurahCount = surahs.filter((s) => {
    const lessons = generateLessons(s.id, s.versesCount);
    return lessons.length > 0 && lessons.every((l) => progressLessons[l.lessonId]?.completedAt != null);
  }).length;

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="px-4 pt-6 pb-2">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-teal">HifzFlow</h1>
              <p className="text-sm text-muted">Quran Memorization</p>
            </div>
            <div className="flex items-center gap-2">
              {stats.currentStreak > 0 && (
                <div className="flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1.5">
                  <FlameIcon size={14} className="text-gold" />
                  <span className="text-sm font-bold text-gold">{stats.currentStreak}</span>
                </div>
              )}
              <SettingsPanel />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        {dueCount > 0 && (
          <a href="/review" className="block">
            <Card className="border-l-4 border-l-gold bg-gold/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">
                    {dueCount} ayah{dueCount !== 1 ? 's' : ''} due for review
                  </p>
                  <p className="text-sm text-muted">Keep your memorization strong</p>
                </div>
                <BookIcon size={24} className="text-gold" />
              </div>
            </Card>
          </a>
        )}

        {activeProgress && activeSurah && (
          <a href={`/lesson/${activeSurah.id}`} className="block">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Continue Learning</p>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-foreground">{activeSurah.nameSimple}</p>
                  <p className="text-sm capitalize text-teal">{activeProgress.currentPhase} phase</p>
                </div>
                <span className="arabic-text text-2xl text-muted">{activeSurah.nameArabic}</span>
              </div>
            </Card>
          </a>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-xl font-bold text-teal">{stats.totalAyahsMemorized}</p>
            <p className="text-xs text-muted">Ayahs</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-bold text-gold">{stats.currentStreak}</p>
            <p className="text-xs text-muted">Day Streak</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-bold text-success">{completedSurahCount}</p>
            <p className="text-xs text-muted">Surahs</p>
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-bold text-foreground">Surahs</h2>
          <div className="grid grid-cols-2 gap-3">
            {surahs.map((surah) => {
              const lessons = generateLessons(surah.id, surah.versesCount);
              const completedLessons = lessons.filter(
                (l) => progressLessons[l.lessonId]?.completedAt != null
              ).length;
              const isComplete = completedLessons === lessons.length && lessons.length > 0;
              const isActive = completedLessons > 0 && !isComplete;
              const progress = lessons.length > 0 ? (completedLessons / lessons.length) * 100 : 0;

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
                      {isComplete && <CheckIcon size={14} className="text-success" />}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground">{surah.nameSimple}</p>
                    <p className="text-xs text-muted">
                      {surah.versesCount} ayahs
                      {lessons.length > 1 && ` · ${lessons.length} lessons`}
                    </p>
                    {(isActive || isComplete) && (
                      <div className="mt-2">
                        <ProgressBar value={progress} />
                        {isActive && (
                          <p className="mt-0.5 text-[10px] text-muted">
                            {completedLessons}/{lessons.length} lessons
                          </p>
                        )}
                      </div>
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
