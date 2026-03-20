'use client';

import { useEffect, useState, useMemo } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useStatsStore } from '@/stores/stats-store';
import { useReviewStore } from '@/stores/review-store';
import { usePracticeStore } from '@/stores/practice-store';
import { getSurahIndex, getJuzIndex } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import type { SurahMeta, JuzMeta, LessonDef } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import { cn } from '@/lib/cn';

export default function ProgressPage() {
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);
  const progressLessons = useProgressStore((s) => s.lessons);
  const stats = useStatsStore();
  const cards = useReviewStore((s) => s.cards);
  const practiceSessions = usePracticeStore((s) => s.sessions);

  useEffect(() => {
    getSurahIndex().then((data) => {
      setSurahs([...data].sort((a, b) => a.id - b.id));
    });
    getJuzIndex().then(setJuzIndex);
  }, []);

  // Build juz segments lookup
  const juzSegmentsBySurah = useMemo(() => {
    const map = new Map<number, Array<{ juzNumber: number; ayahStart: number; ayahEnd: number }>>();
    for (const juz of juzIndex) {
      for (const m of juz.verseMappings) {
        if (!map.has(m.surahId)) map.set(m.surahId, []);
        map.get(m.surahId)!.push({ juzNumber: juz.juzNumber, ayahStart: m.ayahStart, ayahEnd: m.ayahEnd });
      }
    }
    return map;
  }, [juzIndex]);

  const getLessons = (surah: SurahMeta) => {
    const segs = juzSegmentsBySurah.get(surah.id) ?? [];
    return generateLessonsWithJuzBoundaries(surah.id, surah.versesCount, segs);
  };

  const completedLessonCount = Object.values(progressLessons).filter((l) => l.completedAt).length;

  // Surahs with any activity (started lessons or review cards)
  const surahsWithActivity = useMemo(() => {
    const activeSurahIds = new Set<number>();
    // From lesson progress
    for (const lesson of Object.values(progressLessons)) {
      activeSurahIds.add(lesson.surahId);
    }
    // From review cards
    for (const card of cards) {
      activeSurahIds.add(card.surahId);
    }
    return surahs.filter((s) => activeSurahIds.has(s.id));
  }, [surahs, progressLessons, cards]);

  // Count surahs needing attention (have weak/shaky ayahs)
  const surahsNeedingAttention = useMemo(() => {
    const weakCards = cards.filter((c) => c.lastQuality < 4);
    const surahIds = new Set(weakCards.map((c) => c.surahId));
    return surahIds.size;
  }, [cards]);

  // Count fully completed surahs
  const completedSurahCount = useMemo(() => {
    return surahsWithActivity.filter((s) => {
      const lessons = getLessons(s);
      return lessons.length > 0 && lessons.every((l) => progressLessons[l.lessonId]?.completedAt != null);
    }).length;
  }, [surahsWithActivity, progressLessons, juzSegmentsBySurah]);

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-4 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Progress</h1>
            <SettingsPanel />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4">
        {/* Stats grid */}
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
            <p className="text-3xl font-bold text-foreground">{practiceSessions.length}</p>
            <p className="text-xs text-muted">Practice Sessions</p>
          </Card>
        </div>

        {/* Summary row */}
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Surahs started</p>
            <p className="text-lg font-bold text-foreground">{surahsWithActivity.length}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">Completed</p>
            <p className="text-lg font-bold text-success">{completedSurahCount}</p>
          </div>
          {surahsNeedingAttention > 0 && (
            <div className="text-right">
              <p className="text-sm text-muted">Need review</p>
              <a href="/review" className="text-lg font-bold text-red-400">{surahsNeedingAttention}</a>
            </div>
          )}
        </Card>

        {stats.longestStreak > 1 && (
          <Card>
            <p className="text-sm text-muted">Longest streak</p>
            <p className="text-lg font-bold text-gold">
              {stats.longestStreak} day{stats.longestStreak !== 1 ? 's' : ''}
            </p>
          </Card>
        )}

        {/* Surah progress — only surahs with activity */}
        {surahsWithActivity.length > 0 && (
          <div>
            <h2 className="mb-3 text-lg font-bold text-foreground">Surah Progress</h2>
            <div className="space-y-2">
              {surahsWithActivity.map((surah) => {
                const lessons = getLessons(surah);
                const completed = lessons.filter(
                  (l) => progressLessons[l.lessonId]?.completedAt != null
                ).length;
                const started = lessons.filter(
                  (l) => progressLessons[l.lessonId] != null
                ).length;
                const isComplete = completed === lessons.length && lessons.length > 0;
                const progress = lessons.length > 0 ? (completed / lessons.length) * 100 : 0;

                return (
                  <a key={surah.id} href={`/lesson/${surah.id}`} className="block">
                    <Card className={cn(
                      'flex items-center gap-3 transition-all hover:shadow-md',
                      isComplete && 'border border-success/20 bg-success/5'
                    )}>
                      <span className="arabic-text text-lg">{surah.nameArabic}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{surah.nameSimple}</p>
                          <span className="text-xs text-muted">
                            {completed}/{lessons.length} lessons
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
        )}

        {surahsWithActivity.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-lg text-muted">No progress yet</p>
            <p className="mt-1 text-sm text-muted">Start a lesson to track your progress</p>
            <a href="/" className="mt-4 inline-block rounded-xl bg-teal px-6 py-3 font-semibold text-white">
              Start Learning
            </a>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
