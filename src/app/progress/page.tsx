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
  const ayahCards = useReviewStore((s) => s.cards);

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

  // Ayah breakdown from review cards
  const TOTAL_QURAN_AYAHS = 6236;
  const ayahBreakdown = useMemo(() => {
    let strong = 0;
    let medium = 0;
    let weak = 0;
    for (const c of ayahCards) {
      if (c.lastQuality >= 4) strong++;
      else if (c.lastQuality >= 3) medium++;
      else weak++;
    }
    const covered = strong + medium + weak;
    const uncovered = TOTAL_QURAN_AYAHS - covered;
    const pct = TOTAL_QURAN_AYAHS > 0 ? Math.round((strong / TOTAL_QURAN_AYAHS) * 1000) / 10 : 0;
    return { strong, medium, weak, covered, uncovered, pct };
  }, [ayahCards]);

  // This week: activities from the last 7 days
  const thisWeekCount = useMemo(() => {
    const now = new Date();
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      total += stats.activityLog[dateStr] ?? 0;
    }
    return total;
  }, [stats.activityLog]);

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

  // Current juz progress: find the juz with most completed lessons
  const currentJuz = useMemo(() => {
    if (juzIndex.length === 0 || surahs.length === 0) return null;

    let bestJuz: { number: number; completed: number; total: number; pct: number } | null = null;

    for (const juz of juzIndex) {
      const juzLessons = juz.verseMappings.flatMap((mapping) => {
        const surah = surahs.find((s) => s.id === mapping.surahId);
        if (!surah) return [];
        const segs = juzSegmentsBySurah.get(surah.id) ?? [];
        return generateLessonsWithJuzBoundaries(surah.id, surah.versesCount, segs)
          .filter((l) => l.juzNumber === juz.juzNumber);
      });

      const completed = juzLessons.filter((l) => progressLessons[l.lessonId]?.completedAt != null).length;
      if (completed > 0 && juzLessons.length > 0) {
        const pct = Math.round((completed / juzLessons.length) * 100);
        if (!bestJuz || completed > bestJuz.completed) {
          bestJuz = { number: juz.juzNumber, completed, total: juzLessons.length, pct };
        }
      }
    }

    return bestJuz;
  }, [juzIndex, surahs, progressLessons, juzSegmentsBySurah]);

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
        {/* Memorization progress ring + ayah breakdown */}
        <Card className="flex items-center gap-5">
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/10" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
                strokeDasharray={`${ayahBreakdown.pct} 100`}
                strokeLinecap="round" className="text-teal transition-all duration-700" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-teal">
              {ayahBreakdown.pct}%
            </span>
          </div>
          <div className="flex-1 space-y-1.5">
            <p className="text-xs font-medium text-foreground">Ayah Breakdown</p>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-2 w-2 rounded-full bg-success" />
              <span className="text-muted">Strong</span>
              <span className="ml-auto font-semibold text-foreground">{ayahBreakdown.strong}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-2 w-2 rounded-full bg-gold" />
              <span className="text-muted">Shaky</span>
              <span className="ml-auto font-semibold text-foreground">{ayahBreakdown.medium}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
              <span className="text-muted">Weak</span>
              <span className="ml-auto font-semibold text-foreground">{ayahBreakdown.weak}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-2 w-2 rounded-full bg-foreground/10" />
              <span className="text-muted">Not started</span>
              <span className="ml-auto font-semibold text-foreground">{ayahBreakdown.uncovered}</span>
            </div>
          </div>
        </Card>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-2xl font-bold text-gold">{stats.currentStreak}</p>
            <p className="text-xs text-muted">Day Streak</p>
            {stats.longestStreak > 1 && (
              <p className="mt-0.5 text-[10px] text-muted/60">Best: {stats.longestStreak}</p>
            )}
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-bold text-success">{completedLessonCount}</p>
            <p className="text-xs text-muted">Lessons Done</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-bold text-foreground">{thisWeekCount}</p>
            <p className="text-xs text-muted">This Week</p>
          </Card>
        </div>

        {/* Summary */}
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Surahs started</p>
            <p className="text-lg font-bold text-foreground">{surahsStarted}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted">Completed</p>
            <p className="text-lg font-bold text-success">{completedSurahCount}</p>
          </div>
          {currentJuz && (
            <div className="text-right">
              <p className="text-sm text-muted">Juz {currentJuz.number}</p>
              <p className="text-lg font-bold text-teal">{currentJuz.pct}%</p>
            </div>
          )}
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
          <Card className="hover:brightness-100 dark:hover:brightness-100">
            <CalendarHeatmap activityLog={enrichedActivityLog} />
          </Card>
        )}

        {tab === 'timeline' && (
          <Card className="hover:brightness-100 dark:hover:brightness-100">
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
