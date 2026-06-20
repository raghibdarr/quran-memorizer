'use client';

import { useEffect, useState, useMemo } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { useSettingsStore } from '@/stores/settings-store';
import { usePlanStore } from '@/stores/plan-store';
import TodaysPlanCard from '@/components/plan/todays-plan';
import PlanCelebration from '@/components/plan/plan-celebration';
import { getSurahIndex, getJuzIndex } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import type { SurahMeta, JuzMeta } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import Logo from '@/components/ui/logo';
import { FlameIcon, BookIcon, CheckIcon, ArrowRightIcon } from '@/components/ui/icons';
import InstallBanner from '@/components/ui/install-banner';
import OnboardingOverlay from '@/components/ui/onboarding-overlay';
import { cn } from '@/lib/cn';

type SortOption = 'number-asc' | 'number-desc' | 'length-asc' | 'length-desc';
type ViewMode = 'grid' | 'list';
type BrowseTab = 'surahs' | 'juz';

const SORT_LABELS: Record<SortOption, string> = {
  'number-asc': 'Number ↑',
  'number-desc': 'Number ↓',
  'length-asc': 'Shortest first',
  'length-desc': 'Longest first',
};

/** Build a lookup: surahId → juz segments for that surah */
function buildJuzSegmentsBySurah(juzIndex: JuzMeta[]) {
  const map = new Map<number, Array<{ juzNumber: number; ayahStart: number; ayahEnd: number }>>();
  for (const juz of juzIndex) {
    for (const m of juz.verseMappings) {
      if (!map.has(m.surahId)) map.set(m.surahId, []);
      map.get(m.surahId)!.push({ juzNumber: juz.juzNumber, ayahStart: m.ayahStart, ayahEnd: m.ayahEnd });
    }
  }
  // Sort each surah's segments by ayahStart
  for (const segs of map.values()) segs.sort((a, b) => a.ayahStart - b.ayahStart);
  return map;
}

export default function HomePage() {
  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('home-sort') as SortOption) ?? 'number-asc';
    return 'number-asc';
  });
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('home-view') as ViewMode) ?? 'grid';
    return 'grid';
  });
  const [tab, setTab] = useState<BrowseTab>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('home-tab') as BrowseTab) ?? 'surahs';
    return 'surahs';
  });

  useEffect(() => { localStorage.setItem('home-sort', sort); }, [sort]);
  useEffect(() => { localStorage.setItem('home-view', view); }, [view]);
  useEffect(() => { localStorage.setItem('home-tab', tab); }, [tab]);
  const progressLessons = useProgressStore((s) => s.lessons);
  const cards = useReviewStore((s) => s.cards);
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const stats = useStatsStore();
  const lastActivity = useStatsStore((s) => s.lastActivity);
  const dailyGoalActivities = useSettingsStore((s) => s.dailyGoalActivities);
  const plan = usePlanStore((s) => s.plan);

  // Compute today's activity count
  const today = new Date().toISOString().split('T')[0];
  const todayActivities = stats.dailyActivityDate === today ? stats.dailyActivities : 0;
  const dailyProgress = Math.min((todayActivities / dailyGoalActivities) * 100, 100);

  // Due reviews count
  const dueReviewCount = useMemo(() => {
    const now = Date.now();
    return lessonCards.filter((c) => c.nextReview <= now).length;
  }, [lessonCards]);

  useEffect(() => {
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, []);

  const juzSegmentsBySurah = useMemo(() => buildJuzSegmentsBySurah(juzIndex), [juzIndex]);

  /** Generate juz-aware lessons for a surah */
  const getLessons = (surah: SurahMeta) => {
    const segs = juzSegmentsBySurah.get(surah.id) ?? [];
    return generateLessonsWithJuzBoundaries(surah.id, surah.versesCount, segs);
  };

  const surahs = useMemo(() => {
    let filtered = allSurahs;

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

  // Surah name lookup for juz view
  const surahMap = useMemo(() => {
    const m = new Map<number, SurahMeta>();
    for (const s of allSurahs) m.set(s.id, s);
    return m;
  }, [allSurahs]);

  // Find active lesson
  const activeProgress = Object.values(progressLessons).find(
    (l) => l.completedAt === null
  );
  const activeSurah = activeProgress
    ? allSurahs.find((s) => s.id === activeProgress.surahId)
    : null;

  // Count completed lessons and surahs
  const { completedLessonCount, totalLessonCount, completedSurahCount } = useMemo(() => {
    let completed = 0;
    let total = 0;
    let surahsDone = 0;
    for (const s of allSurahs) {
      const lessons = getLessons(s);
      total += lessons.length;
      const done = lessons.filter((l) => progressLessons[l.lessonId]?.completedAt != null).length;
      completed += done;
      if (done === lessons.length && lessons.length > 0) surahsDone++;
    }
    return { completedLessonCount: completed, totalLessonCount: total, completedSurahCount: surahsDone };
  }, [allSurahs, progressLessons, juzSegmentsBySurah]);

  return (
    <div className="min-h-screen bg-cream pb-24">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-2 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo size={48} className="h-10 w-10 rounded-lg" />
              <div>
                <h1 className="text-2xl font-bold text-teal">Takrar</h1>
                <p className="text-sm text-muted">Quran Memorization</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {stats.currentStreak > 0 && (
                <div className="flex items-center gap-1.5 rounded-full border-[1.5px] border-gold/40 bg-gold/10 px-3 py-1.5">
                  <FlameIcon size={14} className="text-gold-deep" />
                  <span className="text-sm font-bold text-gold-deep">{stats.currentStreak}</span>
                  <span className="text-[10px] text-gold-deep/70">day{stats.currentStreak !== 1 ? 's' : ''}</span>
                </div>
              )}
              <SettingsPanel />
              <UserButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        <InstallBanner />

        {plan ? (
          <TodaysPlanCard />
        ) : (
          <a href="/plan/setup" className="block">
            <Card variant="tactile" pressable className="bg-gold/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gold-deep">Hifdh Planner</p>
                  <p className="mt-1 text-lg font-bold text-foreground">Set a memorization goal</p>
                  <p className="mt-0.5 text-xs text-muted">Get a personalised daily plan with reviews and pacing.</p>
                </div>
                <span className="tactile-chip shrink-0 rounded-full bg-gold px-3.5 py-2 text-xs font-bold text-on-gold">Start →</span>
              </div>
            </Card>
          </a>
        )}

        {/* Continue card — hidden when a plan is active (plan card takes over) */}
        {!plan && lastActivity ? (
          <a href={lastActivity.url} className="block">
            <Card variant="tactile" pressable className="p-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal">
                Continue {lastActivity.type === 'lesson' ? 'Learning' : 'Practicing'}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="text-xl font-bold text-foreground">{lastActivity.label}</p>
                <ArrowRightIcon size={20} className="shrink-0 text-teal" />
              </div>
            </Card>
          </a>
        ) : !plan && activeProgress && activeSurah ? (
          <a href={`/lesson/${activeSurah.id}`} className="block">
            <Card variant="tactile" pressable className="p-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal">Continue Learning</p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-bold text-foreground">{activeSurah.nameSimple}</p>
                  <p className="mt-0.5 text-sm capitalize text-teal">{activeProgress.currentPhase} phase</p>
                </div>
                <span className="arabic-text text-3xl text-gold-deep/80">{activeSurah.nameArabic}</span>
              </div>
            </Card>
          </a>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <Card className="flex flex-col items-center justify-center py-3">
            <div className="relative h-10 w-10">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-foreground/10" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeDasharray={`${dailyProgress} 100`}
                  strokeLinecap="round" className={todayActivities >= dailyGoalActivities ? 'text-success' : 'text-teal'} />
              </svg>
              <span className={cn(
                'absolute inset-0 flex items-center justify-center text-[11px] font-bold',
                todayActivities >= dailyGoalActivities ? 'text-success' : 'text-teal'
              )}>
                {todayActivities}/{dailyGoalActivities}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted">Today</p>
          </Card>
          <a href="/review" className="block">
            <Card pressable className="flex h-full flex-col items-center justify-center py-3">
              <p className="text-xl font-bold text-gold-deep">{dueReviewCount}</p>
              <p className="mt-1 text-xs text-muted">Due Reviews</p>
            </Card>
          </a>
          <Card className="flex flex-col items-center justify-center py-3">
            <p className="text-xl font-bold text-teal">{completedLessonCount}<span className="text-sm font-normal text-muted">/{totalLessonCount}</span></p>
            <p className="mt-1 text-xs text-muted">Lessons</p>
          </Card>
        </div>

        {/* Surahs / Juz Tab Toggle */}
        <div className="flex gap-1 rounded-xl border border-foreground/10 bg-foreground/5 p-1">
          <button
            onClick={() => setTab('surahs')}
            className={cn(
              'pressable flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
              tab === 'surahs'
                ? 'ink-border bg-teal text-on-teal'
                : 'text-muted hover:text-foreground'
            )}
          >
            Surahs
          </button>
          <button
            onClick={() => setTab('juz')}
            className={cn(
              'pressable flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
              tab === 'juz'
                ? 'ink-border bg-teal text-on-teal'
                : 'text-muted hover:text-foreground'
            )}
          >
            Juz
          </button>
        </div>

        {tab === 'surahs' ? (
          <div>
            {/* Search */}
            <div className="mb-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or number..."
                className="w-full rounded-xl border-[1.5px] border-foreground/15 bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:border-teal focus:outline-none"
              />
            </div>

            {/* Sort & View Toggle */}
            <div className="mb-3 flex items-center gap-2">
              <div className="scrollbar-hide flex flex-1 gap-2 overflow-x-auto py-1 [mask-image:linear-gradient(to_right,black_88%,transparent)]">
                {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => setSort(option)}
                    className={cn(
                      'pressable shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors',
                      sort === option
                        ? 'ink-border bg-teal text-on-teal'
                        : 'border border-foreground/15 bg-card text-muted hover:text-foreground'
                    )}
                  >
                    {SORT_LABELS[option]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
                className="pressable shrink-0 rounded-lg border border-foreground/15 bg-card p-2.5 text-muted transition-colors hover:text-foreground"
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
                  const lessons = getLessons(surah);
                  const completedLessons = lessons.filter(
                    (l) => progressLessons[l.lessonId]?.completedAt != null
                  ).length;
                  const isComplete = completedLessons === lessons.length && lessons.length > 0;
                  const isActive = completedLessons > 0 && !isComplete;
                  const progress = lessons.length > 0 ? (completedLessons / lessons.length) * 100 : 0;

                  return (
                    <a key={surah.id} href={`/lesson/${surah.id}`}>
                      <Card
                        pressable
                        className={cn(isComplete && 'bg-success/5')}
                      >
                        <div className="flex items-start justify-between">
                          <span className="arabic-text text-xl">{surah.nameArabic}</span>
                          <div className="flex items-center gap-2">
                            {isComplete && <CheckIcon size={14} className="text-success" />}
                            <span className="flex h-6 w-6 shrink-0 rotate-45 items-center justify-center rounded-[7px] border-[1.5px] border-gold/50">
                              <span className="-rotate-45 text-[9px] font-bold text-gold-deep">{surah.id}</span>
                            </span>
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
                  const lessons = getLessons(surah);
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
                        'pressable flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-foreground/5',
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
        ) : (
          /* Juz Tab */
          <div className="grid grid-cols-2 gap-3">
            {juzIndex.map((juz) => {
              // Get all lessons in this juz across all its surahs
              const juzLessons = juz.verseMappings.flatMap((mapping) => {
                const surah = surahMap.get(mapping.surahId);
                if (!surah) return [];
                const allLessons = getLessons(surah);
                return allLessons.filter((l) => l.juzNumber === juz.juzNumber);
              });

              const completedLessons = juzLessons.filter(
                (l) => progressLessons[l.lessonId]?.completedAt != null
              ).length;
              const isComplete = juzLessons.length > 0 && completedLessons === juzLessons.length;
              const isActive = completedLessons > 0 && !isComplete;
              const progress = juzLessons.length > 0 ? (completedLessons / juzLessons.length) * 100 : 0;

              // Surah range label
              const firstSurah = surahMap.get(juz.verseMappings[0]?.surahId);
              const lastSurah = surahMap.get(juz.verseMappings[juz.verseMappings.length - 1]?.surahId);
              const surahCount = juz.verseMappings.length;
              const rangeLabel = firstSurah && lastSurah
                ? firstSurah.id === lastSurah.id
                  ? firstSurah.nameSimple
                  : `${firstSurah.nameSimple} → ${lastSurah.nameSimple}`
                : '';

              return (
                <a key={juz.juzNumber} href={`/juz/${juz.juzNumber}`}>
                  <Card
                    pressable
                    className={cn(isComplete && 'bg-success/5')}
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-lg font-bold text-teal">Juz {juz.juzNumber}</p>
                      {isComplete && <CheckIcon size={14} className="text-success" />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{rangeLabel}</p>
                    <p className="mt-0.5 text-[11px] text-muted/60">{surahCount} surahs · {juzLessons.length} lessons</p>
                    {(isActive || isComplete) && (
                      <div className="mt-2">
                        <ProgressBar value={progress} />
                        {isActive && (
                          <p className="mt-0.5 text-[10px] text-muted">
                            {completedLessons}/{juzLessons.length} lessons
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                </a>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
      <OnboardingOverlay />
      <PlanCelebration />
    </div>
  );
}
