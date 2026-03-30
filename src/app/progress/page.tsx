'use client';

import { useEffect, useState, useMemo } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useStatsStore } from '@/stores/stats-store';
import { useReviewStore } from '@/stores/review-store';
import { getSurahIndex, getJuzIndex } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import type { SurahMeta, JuzMeta } from '@/types/quran';
import Card from '@/components/ui/card';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import CalendarHeatmap from '@/components/progress/calendar-heatmap';
import TimelineChart from '@/components/progress/timeline-chart';
import { cn } from '@/lib/cn';

type ProgressTab = 'calendar' | 'timeline';

export default function ProgressPage() {
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);
  const [tab, setTab] = useState<ProgressTab>('calendar');
  const progressLessons = useProgressStore((s) => s.lessons);
  const stats = useStatsStore();
  const lessonCards = useReviewStore((s) => s.lessonCards);

  useEffect(() => {
    getSurahIndex().then((data) => setSurahs([...data].sort((a, b) => a.id - b.id)));
    getJuzIndex().then(setJuzIndex);
  }, []);

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

  const completedLessonCount = Object.values(progressLessons).filter((l) => l.completedAt).length;

  const totalReviews = useMemo(() => {
    return lessonCards.filter((c) => c.repetitions > 0).length;
  }, [lessonCards]);

  const surahsStarted = useMemo(() => {
    const ids = new Set<number>();
    for (const lesson of Object.values(progressLessons)) ids.add(lesson.surahId);
    return ids.size;
  }, [progressLessons]);

  const completedSurahCount = useMemo(() => {
    let count = 0;
    for (const s of surahs) {
      const segs = juzSegmentsBySurah.get(s.id) ?? [];
      const lessons = generateLessonsWithJuzBoundaries(s.id, s.versesCount, segs);
      if (lessons.length > 0 && lessons.every((l) => progressLessons[l.lessonId]?.completedAt != null)) {
        count++;
      }
    }
    return count;
  }, [surahs, progressLessons, juzSegmentsBySurah]);

  // Enrich activityLog with backfilled data from lesson completedAt timestamps
  const enrichedActivityLog = useMemo(() => {
    const log: Record<string, number> = { ...stats.activityLog };
    for (const lesson of Object.values(progressLessons)) {
      if (lesson.completedAt) {
        const date = new Date(lesson.completedAt).toISOString().split('T')[0];
        log[date] = Math.max(log[date] ?? 0, 1);
      }
    }
    return log;
  }, [stats.activityLog, progressLessons]);

  const hasActivity = Object.keys(progressLessons).length > 0;

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-4 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Progress</h1>
            <div className="flex items-center gap-2">
              <SettingsPanel />
              <UserButton />
            </div>
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
            {stats.longestStreak > 1 && (
              <p className="mt-0.5 text-[10px] text-muted/60">Best: {stats.longestStreak} days</p>
            )}
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-success">{completedLessonCount}</p>
            <p className="text-xs text-muted">Lessons Done</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-foreground">{totalReviews}</p>
            <p className="text-xs text-muted">Reviews Done</p>
          </Card>
        </div>

        {/* Summary */}
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Surahs started</p>
            <p className="text-lg font-bold text-foreground">{surahsStarted}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">Completed</p>
            <p className="text-lg font-bold text-success">{completedSurahCount}</p>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-foreground/10 p-1">
          {([['calendar', 'Calendar'], ['timeline', 'Timeline']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
                tab === key
                  ? 'bg-teal text-white shadow-sm'
                  : 'text-muted hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'calendar' && (
          <Card>
            <CalendarHeatmap activityLog={enrichedActivityLog} />
          </Card>
        )}

        {tab === 'timeline' && (
          <Card>
            <TimelineChart lessons={progressLessons} />
          </Card>
        )}

        {!hasActivity && (
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
