'use client';

import Link from '@/components/app-link';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useStatsStore } from '@/stores/stats-store';
import { usePlanStore } from '@/stores/plan-store';
import TodaysPlanCard from '@/components/plan/todays-plan';
import PlanCelebration from '@/components/plan/plan-celebration';
import { getSurahIndex, getJuzIndex } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import { fuzzySurahScore } from '@/lib/fuzzy';
import type { SurahMeta, JuzMeta } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import Logo from '@/components/ui/logo';
import { FlameIcon, CheckIcon, ArrowRightIcon } from '@/components/ui/icons';
import InstallBanner from '@/components/ui/install-banner';
import OnboardingOverlay from '@/components/ui/onboarding-overlay';
import { cn } from '@/lib/cn';
import { normalizeAppUrl } from '@/lib/routes';
import { useReviewQueue } from '@/hooks/use-review-queue';
import { useShellRouteRecovery } from '@/hooks/use-shell-route-recovery';
import { useTodaysPlan } from '@/hooks/use-todays-plan';
import DayCompleteMoment from '@/components/plan/day-complete';
import WelcomeBack from '@/components/welcome-back';
import { useDeal } from '@/hooks/use-deal';
import { Skeleton } from '@/components/ui/skeleton';
import SegmentedControl from '@/components/ui/segmented-control';

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
  useShellRouteRecovery();
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
  // Natural (unstuck) position of the browse controls — search focus docks to it
  const controlsAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem('home-sort', sort); }, [sort]);
  useEffect(() => { localStorage.setItem('home-view', view); }, [view]);
  useEffect(() => { localStorage.setItem('home-tab', tab); }, [tab]);
  const progressLessons = useProgressStore((s) => s.lessons);
  const stats = useStatsStore();
  const lastActivity = useStatsStore((s) => s.lastActivity);
  const plan = usePlanStore((s) => s.plan);

  // THE "done today" (src/lib/day-status.ts): plan-driven for plan users,
  // the activity goal otherwise — the ring never disagrees with the plan card
  const { dayStatus, progress: planProgress } = useTodaysPlan();
  const dailyProgress = dayStatus.total > 0 ? Math.min((dayStatus.done / dayStatus.total) * 100, 100) : 0;
  const restDayIdle = dayStatus.isRestDay && dayStatus.total === 0;

  // Due reviews — the SAME queue the plan card and review page use (M5 streams,
  // incl. sabqi check-ins), so the three counts can never disagree
  const { dueCount: dueReviewCount, overdueCount: overdueReviewCount } = useReviewQueue();

  useEffect(() => {
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, []);

  const juzSegmentsBySurah = useMemo(() => buildJuzSegmentsBySurah(juzIndex), [juzIndex]);

  // Browse rows are dealt in on first paint, tab/view switch, and when data lands
  const browseLoaded = tab === 'surahs' ? allSurahs.length > 0 : allSurahs.length > 0 && juzIndex.length > 0;
  const dealKey = `${tab}-${view}-${browseLoaded ? 1 : 0}`;
  const deal = useDeal(dealKey);

  /** Generate juz-aware lessons for a surah */
  const getLessons = (surah: SurahMeta) => {
    const segs = juzSegmentsBySurah.get(surah.id) ?? [];
    return generateLessonsWithJuzBoundaries(surah.id, surah.versesCount, segs);
  };

  const surahs = useMemo(() => {
    // While searching, rank fuzzily by relevance (typos, spelling variants, and
    // article-less names all match); the sort chips apply to browsing only.
    if (search.trim()) {
      return allSurahs
        .map((s) => ({
          s,
          score: fuzzySurahScore(search, {
            id: s.id,
            name: s.nameSimple,
            translation: s.nameTranslation,
            arabic: s.nameArabic,
          }),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.s.id - b.s.id)
        .map((x) => x.s);
    }

    const sorted = [...allSurahs];
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
  const { completedLessonCount, completedSurahCount } = useMemo(() => {
    let completed = 0;
    let surahsDone = 0;
    for (const s of allSurahs) {
      const lessons = generateLessonsWithJuzBoundaries(s.id, s.versesCount, juzSegmentsBySurah.get(s.id) ?? []);
      const done = lessons.filter((l) => progressLessons[l.lessonId]?.completedAt != null).length;
      completed += done;
      if (done === lessons.length && lessons.length > 0) surahsDone++;
    }
    return { completedLessonCount: completed, completedSurahCount: surahsDone };
  }, [allSurahs, progressLessons, juzSegmentsBySurah]);

  return (
    <div className="min-h-dvh bg-cream pb-24">
      <header className="px-4 pt-6 pb-2">
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
                  <FlameIcon size={16} className="text-gold-deep" />
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

        <WelcomeBack />
        {plan && <DayCompleteMoment />}
        {plan ? (
          <TodaysPlanCard />
        ) : (
          <Link href="/plan/setup" className="block">
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
          </Link>
        )}

        {/* Continue card — hidden when a plan is active (plan card takes over) */}
        {!plan && lastActivity ? (
          <Link href={normalizeAppUrl(lastActivity.url)} className="block">
            <Card variant="tactile" pressable className="p-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal">
                Continue {lastActivity.type === 'lesson' ? 'Learning' : 'Practicing'}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="text-xl font-bold text-foreground">{lastActivity.label}</p>
                <ArrowRightIcon size={20} className="shrink-0 text-teal" />
              </div>
            </Card>
          </Link>
        ) : !plan && activeProgress && activeSurah ? (
          <Link href={`/lesson/${activeSurah.id}`} className="block">
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
          </Link>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <Card className="flex flex-col items-center justify-center py-3">
            <div className="relative h-10 w-10">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-foreground/10" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeDasharray={`${dailyProgress} 100`}
                  strokeLinecap="round" className={dayStatus.complete ? 'text-success' : 'text-teal'} />
              </svg>
              <span className={cn(
                'absolute inset-0 flex items-center justify-center text-[11px] font-bold',
                dayStatus.complete ? 'text-success' : 'text-teal'
              )}>
                {restDayIdle ? '—' : dayStatus.complete ? <CheckIcon size={14} /> : `${dayStatus.done}/${dayStatus.total}`}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted">{restDayIdle ? 'Rest day' : 'Today'}</p>
          </Card>
          <Link href="/review" className="block">
            <Card pressable className="flex h-full flex-col items-center justify-center py-3">
              <p className="text-xl font-bold text-gold-deep">{dueReviewCount}</p>
              <p className="mt-1 text-xs text-muted">
                {overdueReviewCount > 0 ? `Due · ${overdueReviewCount} overdue` : 'Due Reviews'}
              </p>
            </Card>
          </Link>
          {/* Plan-scoped when there's a plan (audit m6) — "/2259" read as "you've done nothing" */}
          <Card className="flex flex-col items-center justify-center py-3">
            {planProgress ? (
              <>
                <p className="text-xl font-bold text-teal">{planProgress.completedLessons}<span className="text-sm font-normal text-muted">/{planProgress.totalLessons}</span></p>
                <p className="mt-1 text-xs text-muted">Plan lessons</p>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-teal">{completedLessonCount}</p>
                <p className="mt-1 text-xs text-muted">
                  {completedSurahCount > 0 ? `Lessons · ${completedSurahCount} surah${completedSurahCount === 1 ? '' : 's'}` : 'Lessons done'}
                </p>
              </>
            )}
          </Card>
        </div>

        {/* Anchor marking the controls' natural position (scroll target on search focus) */}
        <div ref={controlsAnchorRef} className="h-0 mb-0!" aria-hidden />

        {/* Browse controls — pin to the top once scrolled past */}
        <div className="sticky top-[var(--safe-top)] z-20 -mx-4 space-y-3 bg-cream/95 px-4 pb-3 pt-2 backdrop-blur-sm">
          {/* Surahs / Juz Tab Toggle */}
          <SegmentedControl
            options={[{ value: 'surahs', label: 'Surahs' }, { value: 'juz', label: 'Juz' }]}
            value={tab}
            onChange={setTab}
            className="border border-foreground/10"
            chipClassName="ink-border"
          />

          {tab === 'surahs' && (
            <>
              {/* Search — on focus, dock the controls to their pinned position so
                  the input stays put while results grow/shrink underneath */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => {
                  const anchor = controlsAnchorRef.current;
                  if (!anchor) return;
                  const y = anchor.getBoundingClientRect().top + window.scrollY;
                  if (window.scrollY < y) window.scrollTo({ top: y, behavior: 'smooth' });
                }}
                placeholder="Search by name or number..."
                className="w-full rounded-xl border-[1.5px] border-foreground/15 bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:border-teal focus:outline-none"
              />

              {/* Sort & View Toggle */}
              <div className="flex items-center gap-2">
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
            </>
          )}
        </div>

        {tab === 'surahs' ? (
          /* min-height keeps the page from collapsing (and the scroll from jumping)
             as search results shrink while typing */
          <div className="min-h-[75dvh]">
            {surahs.length === 0 && search.trim() && (
              <p className="py-8 text-center text-sm text-muted">No surahs found</p>
            )}

            {!browseLoaded ? (
              <div className="grid grid-cols-2 gap-3" role="status" aria-label="Loading surahs">
                {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[6.5rem]" />)}
              </div>
            ) : view === 'grid' ? (
              <div key={dealKey} className="grid grid-cols-2 gap-3" {...deal.container}>
                {surahs.map((surah, i) => {
                  const lessons = getLessons(surah);
                  const completedLessons = lessons.filter(
                    (l) => progressLessons[l.lessonId]?.completedAt != null
                  ).length;
                  const isComplete = completedLessons === lessons.length && lessons.length > 0;
                  const isActive = completedLessons > 0 && !isComplete;
                  const progress = lessons.length > 0 ? (completedLessons / lessons.length) * 100 : 0;

                  return (
                    <Link key={surah.id} href={`/lesson/${surah.id}`} className="deal-in" style={deal.row(i)}>
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
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div key={dealKey} className="space-y-1" {...deal.container}>
                {surahs.map((surah, i) => {
                  const lessons = getLessons(surah);
                  const completedLessons = lessons.filter(
                    (l) => progressLessons[l.lessonId]?.completedAt != null
                  ).length;
                  const isComplete = completedLessons === lessons.length && lessons.length > 0;
                  const isActive = completedLessons > 0 && !isComplete;
                  const progress = lessons.length > 0 ? (completedLessons / lessons.length) * 100 : 0;

                  return (
                    <Link
                      key={surah.id}
                      href={`/lesson/${surah.id}`}
                      className={cn(
                        'deal-in pressable flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-foreground/5',
                        isComplete && 'bg-success/5'
                      )}
                      style={deal.row(i)}
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
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Juz Tab */
          !browseLoaded ? (
            <div className="grid grid-cols-2 gap-3" role="status" aria-label="Loading juz">
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[5.5rem]" />)}
            </div>
          ) : (
          <div key={dealKey} className="grid grid-cols-2 gap-3" {...deal.container}>
            {juzIndex.map((juz, i) => {
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
                <Link key={juz.juzNumber} href={`/juz/${juz.juzNumber}`} className="deal-in" style={deal.row(i)}>
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
                </Link>
              );
            })}
          </div>
          )
        )}
      </main>

      <BottomNav />
      <OnboardingOverlay />
      <PlanCelebration />
    </div>
  );
}
