'use client';

import { useEffect, useState, useMemo } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { getSurahIndex } from '@/lib/quran-data';
import { generateLessons } from '@/lib/curriculum';
import type { SurahMeta } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import { FlameIcon, BookIcon, CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

type SortOption = 'number-asc' | 'number-desc' | 'length-asc' | 'length-desc';
type ViewMode = 'grid' | 'list';

const SORT_LABELS: Record<SortOption, string> = {
  'number-asc': 'Number ↑',
  'number-desc': 'Number ↓',
  'length-asc': 'Shortest first',
  'length-desc': 'Longest first',
};

export default function HomePage() {
  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('number-asc');
  const [view, setView] = useState<ViewMode>('grid');
  const progressLessons = useProgressStore((s) => s.lessons);
  const cards = useReviewStore((s) => s.cards);
  const dueCount = cards.filter((c) => c.nextReview <= Date.now()).length;
  const stats = useStatsStore();

  useEffect(() => {
    getSurahIndex().then(setAllSurahs);
  }, []);

  const surahs = useMemo(() => {
    let filtered = allSurahs;

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.nameSimple.toLowerCase().includes(q) ||
          s.nameArabic.includes(q) ||
          s.nameTranslation.toLowerCase().includes(q) ||
          s.id.toString() === q
      );
    }

    // Sort
    const sorted = [...filtered];
    switch (sort) {
      case 'number-asc':
        sorted.sort((a, b) => a.id - b.id);
        break;
      case 'number-desc':
        sorted.sort((a, b) => b.id - a.id);
        break;
      case 'length-asc':
        sorted.sort((a, b) => a.versesCount - b.versesCount);
        break;
      case 'length-desc':
        sorted.sort((a, b) => b.versesCount - a.versesCount);
        break;
    }

    return sorted;
  }, [allSurahs, search, sort]);

  // Find active lesson (any in-progress lesson)
  const activeProgress = Object.values(progressLessons).find(
    (l) => l.completedAt === null
  );
  const activeSurah = activeProgress
    ? allSurahs.find((s) => s.id === activeProgress.surahId)
    : null;

  // Count completed surahs (all lessons done)
  const completedSurahCount = allSurahs.filter((s) => {
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

          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or number..."
              className="w-full rounded-xl border border-foreground/10 bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
            />
          </div>

          {/* Sort & View Toggle */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setSort(option)}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    sort === option
                      ? 'bg-teal text-white'
                      : 'bg-foreground/5 text-muted hover:bg-foreground/10'
                  )}
                >
                  {SORT_LABELS[option]}
                </button>
              ))}
            </div>
            <button
              onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
              className="shrink-0 rounded-lg bg-foreground/5 p-2 text-muted transition-colors hover:bg-foreground/10"
              title={view === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
            >
              {view === 'grid' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
              )}
            </button>
          </div>

          {surahs.length === 0 && search.trim() && (
            <p className="py-8 text-center text-sm text-muted">No surahs found</p>
          )}

          {view === 'grid' ? (
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
                        <div className="flex items-center gap-1.5">
                          {isComplete && <CheckIcon size={14} className="text-success" />}
                          <span className="text-xs font-medium text-muted">{surah.id}</span>
                        </div>
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
          ) : (
            <div className="space-y-1">
              {surahs.map((surah) => {
                const lessons = generateLessons(surah.id, surah.versesCount);
                const completedLessons = lessons.filter(
                  (l) => progressLessons[l.lessonId]?.completedAt != null
                ).length;
                const isComplete = completedLessons === lessons.length && lessons.length > 0;
                const isActive = completedLessons > 0 && !isComplete;
                const progress = lessons.length > 0 ? (completedLessons / lessons.length) * 100 : 0;

                return (
                  <a
                    key={surah.id}
                    href={`/lesson/${surah.id}`}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-foreground/5',
                      isComplete && 'bg-success/5'
                    )}
                  >
                    <span className="w-8 text-right text-xs font-medium text-muted">{surah.id}</span>
                    <span className="arabic-text text-lg leading-none">{surah.nameArabic}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{surah.nameSimple}</p>
                      <p className="text-xs text-muted">
                        {surah.versesCount} ayahs
                        {lessons.length > 1 && ` · ${lessons.length} lessons`}
                        {isActive && ` · ${completedLessons}/${lessons.length} done`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {(isActive || isComplete) && (
                        <div className="w-16">
                          <ProgressBar value={progress} />
                        </div>
                      )}
                      {isComplete && <CheckIcon size={12} className="text-success" />}
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
