'use client';

import Link from 'next/link';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getSurah, getJuzSegmentsForSurah } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import { useProgressStore } from '@/stores/progress-store';
import { usePlanStore } from '@/stores/plan-store';
import { useReviewStore } from '@/stores/review-store';
import type { Surah, LessonDef } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import PracticeContainer from '@/components/practice/practice-container';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { lessonHref } from '@/lib/routes';

type Tab = 'learn' | 'practice';

export default function SurahDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const surahId = parseInt(params.surahId as string, 10);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [lessons, setLessons] = useState<LessonDef[]>([]);
  const progressLessons = useProgressStore((s) => s.lessons);
  const plan = usePlanStore((s) => s.plan);
  const toggleKnownSurah = usePlanStore((s) => s.toggleKnownSurah);
  const seedKnownAyahs = useReviewStore((s) => s.seedKnownAyahs);
  const initialTab = searchParams.get('tab') === 'practice' ? 'practice' : 'learn';
  const reviewLessonNum = searchParams.get('reviewLesson') ? parseInt(searchParams.get('reviewLesson')!, 10) : null;
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useEffect(() => {
    Promise.all([getSurah(surahId), getJuzSegmentsForSurah(surahId)]).then(([s, juzSegs]) => {
      setSurah(s);
      setLessons(generateLessonsWithJuzBoundaries(surahId, s.versesCount, juzSegs));
    });
  }, [surahId]);

  if (!surah) return null;

  const isSingleLesson = lessons.length === 1;
  const completedCount = lessons.filter(
    (l) => progressLessons[l.lessonId]?.completedAt != null
  ).length;
  const overallProgress = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;

  // Browse-level "I already know this" (M4/m9): only offered when a plan exists,
  // the surah is in its scope, and nothing has been learned here yet
  const isKnown = plan?.knownSurahIds.includes(surahId) ?? false;
  const canMarkKnown =
    plan != null &&
    plan.goalSurahIds.includes(surahId) &&
    (isKnown || completedCount === 0);
  const handleToggleKnown = () => {
    if (!surah) return;
    if (!isKnown) seedKnownAyahs(surahId, 1, surah.versesCount);
    toggleKnownSurah(surahId);
  };

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-cream/95 px-4 py-3 backdrop-blur-sm border-b border-foreground/5">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <Link href={reviewLessonNum ? '/review' : '/'} className="text-sm text-muted hover:text-foreground">&larr; Back</Link>
          <div className="flex items-center gap-2">
            <SettingsPanel />
            <UserButton />
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="px-4 pt-4 pb-4 border-b border-foreground/5">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <p className="arabic-text text-3xl">{surah.nameArabic}</p>
            <h1 className="mt-1 text-xl font-bold text-foreground">{surah.nameSimple}</h1>
            <p className="text-sm text-muted">
              {surah.nameTranslation} &middot; {surah.versesCount} ayahs &middot; {lessons.length} lessons
            </p>
          </div>
          <div className="mt-3">
            <ProgressBar value={overallProgress} />
            <p className="mt-1 text-center text-xs text-muted">
              {completedCount} / {lessons.length} lessons completed
            </p>
          </div>
          {canMarkKnown && (
            <div className="mt-3 text-center">
              {isKnown ? (
                <button
                  onClick={handleToggleKnown}
                  className="rounded-full bg-success/10 px-4 py-1.5 text-xs font-semibold text-success"
                >
                  ✓ Marked as known — in your revision cycle (tap to undo)
                </button>
              ) : (
                <button
                  onClick={handleToggleKnown}
                  className="rounded-full border border-foreground/15 px-4 py-1.5 text-xs font-semibold text-muted hover:border-teal/40 hover:text-teal"
                >
                  I already know this surah
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Learn / Practice tab toggle — pins below the top bar on scroll */}
      <div className="sticky top-14 z-10 bg-cream/95 px-4 py-2 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex gap-1 rounded-xl bg-foreground/5 p-1">
            <button
              onClick={() => setActiveTab('learn')}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
                activeTab === 'learn' ? 'bg-teal text-on-teal' : 'text-muted hover:text-foreground'
              )}
            >
              Learn
            </button>
            <button
              onClick={() => setActiveTab('practice')}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
                activeTab === 'practice' ? 'bg-teal text-on-teal' : 'text-muted hover:text-foreground'
              )}
            >
              Review
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {activeTab === 'learn' ? (
          isSingleLesson && lessons[0] ? (
            /* Single-lesson surah: show a start card */
            (() => {
              const lesson = lessons[0];
              const progress = progressLessons[lesson.lessonId];
              const isComplete = progress?.completedAt != null;
              const isActive = progress && !isComplete;
              const phaseProgress = isActive
                ? ['listen', 'understand', 'chunk', 'test', 'complete'].indexOf(progress.currentPhase) * 25
                : isComplete ? 100 : 0;
              return (
                <Link href={lessonHref(surahId, 1)} className="block">
                  <Card className={cn(
                    'text-center transition-all hover:shadow-md',
                    isComplete && 'border border-success/20 bg-success/5'
                  )}>
                    {isComplete ? (
                      <>
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success text-on-success">
                          <CheckIcon size={20} />
                        </div>
                        <p className="text-sm font-semibold text-foreground">Lesson Complete</p>
                        <p className="mt-1 text-xs text-muted">Tap to review</p>
                      </>
                    ) : isActive ? (
                      <>
                        <p className="text-sm font-semibold text-foreground">Continue Lesson</p>
                        <div className="mt-2">
                          <ProgressBar value={phaseProgress} className="h-1.5" />
                          <p className="mt-1 text-xs capitalize text-teal">{progress.currentPhase} phase</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-foreground">Start Lesson</p>
                        <p className="mt-1 text-xs text-muted">{surah.versesCount} ayahs</p>
                        <p className="mt-1 text-[11px] text-muted/70">~20–40 min — stop anytime, progress saves</p>
                      </>
                    )}
                  </Card>
                </Link>
              );
            })()
          ) : (
            /* Multi-lesson surah: lesson list */
            <div className="space-y-2">
              {lessons.map((lesson, idx) => {
                const prevJuz = idx > 0 ? lessons[idx - 1].juzNumber : lesson.juzNumber;
                const showJuzDivider = lesson.juzNumber !== prevJuz;
                const isMultiJuz = lessons.length > 0 && lessons[0].juzNumber !== lessons[lessons.length - 1].juzNumber;
                const showFirstJuzLabel = isMultiJuz && idx === 0;
                const progress = progressLessons[lesson.lessonId];
                const isComplete = progress?.completedAt != null;
                const isActive = progress && !isComplete;
                const phaseProgress = isActive
                  ? ['listen', 'understand', 'chunk', 'test', 'complete'].indexOf(progress.currentPhase) * 25
                  : isComplete ? 100 : 0;

                return (
                  <div key={lesson.lessonId}>
                    {(showJuzDivider || showFirstJuzLabel) && (
                      <div className="flex items-center gap-3 py-2">
                        <div className="h-px flex-1 bg-foreground/10" />
                        <span className="text-xs font-medium text-teal">Juz {lesson.juzNumber}</span>
                        <div className="h-px flex-1 bg-foreground/10" />
                      </div>
                    )}
                    <Link href={lessonHref(surahId, lesson.lessonNumber)} className="block">
                      <Card
                        className={cn(
                          'flex items-center gap-4 transition-all hover:shadow-md',
                          isComplete && 'border border-success/20 bg-success/5'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold',
                            isComplete ? 'bg-success text-on-success' :
                            isActive ? 'bg-teal text-on-teal' :
                            'bg-foreground/10 text-muted'
                          )}
                        >
                          {isComplete ? <CheckIcon size={16} /> : lesson.lessonNumber}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            Lesson {lesson.lessonNumber}
                          </p>
                          <p className="text-xs text-muted">
                            Ayahs {lesson.ayahStart}&ndash;{lesson.ayahEnd}
                          </p>
                          {isActive && (
                            <div className="mt-1.5">
                              <ProgressBar value={phaseProgress} className="h-1" />
                              <p className="mt-0.5 text-[10px] capitalize text-teal">
                                {progress.currentPhase} phase
                              </p>
                            </div>
                          )}
                        </div>
                      </Card>
                    </Link>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Practice tab */
          <PracticeContainer surah={surah} lessons={lessons} autoStartLesson={reviewLessonNum} />
        )}
      </main>

      <BottomNav />
    </div>
  );
}
