'use client';

import { useEffect, useState } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useStatsStore } from '@/stores/stats-store';
import { useReviewStore } from '@/stores/review-store';
import { getSurahIndex, getJuzIndex } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import type { SurahMeta, JuzMeta } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';

export default function ProgressPage() {
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);
  const progressLessons = useProgressStore((s) => s.lessons);
  const stats = useStatsStore();
  const cards = useReviewStore((s) => s.cards);

  useEffect(() => {
    getSurahIndex().then((data) => {
      setSurahs([...data].sort((a, b) => a.id - b.id));
    });
    getJuzIndex().then(setJuzIndex);
  }, []);

  // Build juz segments lookup
  const juzSegmentsBySurah = new Map<number, Array<{ juzNumber: number; ayahStart: number; ayahEnd: number }>>();
  for (const juz of juzIndex) {
    for (const m of juz.verseMappings) {
      if (!juzSegmentsBySurah.has(m.surahId)) juzSegmentsBySurah.set(m.surahId, []);
      juzSegmentsBySurah.get(m.surahId)!.push({ juzNumber: juz.juzNumber, ayahStart: m.ayahStart, ayahEnd: m.ayahEnd });
    }
  }

  const getLessons = (surah: SurahMeta) => {
    const segs = juzSegmentsBySurah.get(surah.id) ?? [];
    return generateLessonsWithJuzBoundaries(surah.id, surah.versesCount, segs);
  };

  const completedLessonCount = Object.values(progressLessons).filter((l) => l.completedAt).length;

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="px-4 pt-6 pb-4">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Progress</h1>
            <SettingsPanel />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4">
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
            <p className="text-3xl font-bold text-success">{completedLessonCount}</p>
            <p className="text-xs text-muted">Lessons Done</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-foreground">{cards.length}</p>
            <p className="text-xs text-muted">Review Cards</p>
          </Card>
        </div>

        {stats.longestStreak > 0 && (
          <Card>
            <p className="text-sm text-muted">Longest streak</p>
            <p className="text-lg font-bold text-gold">
              {stats.longestStreak} day{stats.longestStreak !== 1 ? 's' : ''}
            </p>
          </Card>
        )}

        <div>
          <h2 className="mb-3 text-lg font-bold text-foreground">Surah Progress</h2>
          <div className="space-y-2">
            {surahs.map((surah) => {
              const lessons = getLessons(surah);
              const completed = lessons.filter(
                (l) => progressLessons[l.lessonId]?.completedAt != null
              ).length;
              const isComplete = completed === lessons.length && lessons.length > 0;
              const progress = lessons.length > 0 ? (completed / lessons.length) * 100 : 0;

              return (
                <a key={surah.id} href={`/lesson/${surah.id}`} className="block">
                  <Card className="flex items-center gap-3">
                    <span className="arabic-text text-lg">{surah.nameArabic}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{surah.nameSimple}</p>
                        <span className="text-xs text-muted">
                          {completed}/{lessons.length}
                        </span>
                      </div>
                      <ProgressBar
                        value={progress}
                        color={isComplete ? 'bg-success' : 'bg-teal'}
                        className="mt-1"
                      />
                    </div>
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
