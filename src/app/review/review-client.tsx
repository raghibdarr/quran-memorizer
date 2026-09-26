'use client';

import Link from '@/components/app-link';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useReviewStore } from '@/stores/review-store';
import { useProgressStore } from '@/stores/progress-store';
import { usePlanStore } from '@/stores/plan-store';
import { getSurahIndex, getJuzSegmentsForSurah, getSurah } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import { computeSurahHealth } from '@/lib/review-helpers';
import { getLeeches, RETENTION, type Stream } from '@/lib/retention';
import { useReviewQueue } from '@/hooks/use-review-queue';
import type { SurahMeta, LessonDef } from '@/types/quran';
import type { SurahHealth } from '@/lib/review-helpers';
import { NAV_FORWARD } from '@/lib/nav';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import { StarIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export default function ReviewPage() {
  const cards = useReviewStore((s) => s.cards);
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const plan = usePlanStore((s) => s.plan);
  // Legacy deep link ?start=1[&stream=…] (bookmarks, older builds) → the session
  // SCREEN, /review/session (M11b)
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPlan = searchParams.get('start') === '1';
  const streamParam = searchParams.get('stream') as Stream | null;
  useEffect(() => {
    if (!fromPlan) return;
    router.replace(`/review/session?from=plan${streamParam ? `&stream=${streamParam}` : ''}`);
  }, [fromPlan, streamParam, router]);

  const [surahIndex, setSurahIndex] = useState<SurahMeta[]>([]);
  const [surahLessons, setSurahLessons] = useState<Record<number, LessonDef[]>>({});
  const [loading, setLoading] = useState(true);

  // Get unique surah IDs from review cards
  const surahIds = useMemo(() => {
    const ids = new Set(cards.map((c) => c.surahId));
    return [...ids].sort((a, b) => a - b);
  }, [cards]);

  // Load surah index and lessons for all surahs with cards
  useEffect(() => {
    getSurahIndex().then(async (index) => {
      setSurahIndex(index);

      const lessonsMap: Record<number, LessonDef[]> = {};
      for (const surahId of surahIds) {
        const surah = index.find((s) => s.id === surahId);
        if (!surah) continue;
        const juzSegs = await getJuzSegmentsForSurah(surahId);
        lessonsMap[surahId] = generateLessonsWithJuzBoundaries(surahId, surah.versesCount, juzSegs);
      }
      setSurahLessons(lessonsMap);
      setLoading(false);
    });
  }, [surahIds]);

  // Compute health for all surahs
  const surahHealths = useMemo(() => {
    return surahIds
      .map((id) => {
        const lessons = surahLessons[id];
        if (!lessons) return null;
        return computeSurahHealth(id, lessons, cards);
      })
      .filter(Boolean) as SurahHealth[];
  }, [surahIds, surahLessons, cards]);

  // Sort: needs attention first
  const sortedHealths = useMemo(() => {
    return [...surahHealths].sort((a, b) => {
      if (a.needsAttention && !b.needsAttention) return -1;
      if (!a.needsAttention && b.needsAttention) return 1;
      return (b.totalWeak + b.totalHesitant) - (a.totalWeak + a.totalHesitant);
    });
  }, [surahHealths]);

  const surahMap = useMemo(() => new Map(surahIndex.map((s) => [s.id, s])), [surahIndex]);

  const totalWeak = surahHealths.reduce((s, h) => s + h.totalWeak, 0);
  const totalHesitant = surahHealths.reduce((s, h) => s + h.totalHesitant, 0);
  const totalStrong = surahHealths.reduce((s, h) => s + h.totalStrong, 0);

  // Today's review queue (M5): recent (sabqi) lessons first — they're the most
  // fragile — then older (manzil) SM-2-due lessons, most overdue first
  const queue = useReviewQueue();
  const dueCards = useMemo(() => [...queue.sabqi, ...queue.manzil], [queue]);
  const dueCount = dueCards.length;
  const leeches = useMemo(() => getLeeches(cards), [cards]);

  // Sessions are their own screen (M11b) — pushed, so back closes them
  const openSession = (query = '') =>
    router.push(`/review/session${query}`, { transitionTypes: [NAV_FORWARD] });
  const startReview = () => openSession();
  const startSurahReview = (surahId: number) => {
    if (dueCards.some((c) => c.surahId === surahId)) openSession(`?surah=${surahId}`);
  };
  const startLessonReview = (lessonId: string) => {
    if (lessonCards.some((c) => c.lessonId === lessonId)) openSession(`?lesson=${lessonId}`);
  };

  if (fromPlan) return null;
  // Keep the tab bar while loading: a screen with no tab bar makes the transition
  // slide it away and pop it back a moment later
  if (loading) return <div className="min-h-dvh bg-cream"><BottomNav /></div>;

  // Empty state — route a hafiz to revision, not the beginner-lesson funnel (M4)
  if (surahIds.length === 0) {
    const isHafiz = (plan?.knownSurahIds.length ?? 0) > 0 || plan?.goalType === 'maintain';
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-cream px-4 pb-20">
        <StarIcon size={40} className="text-teal" />
        <h2 className="mt-4 text-xl font-bold text-foreground">No reviews yet</h2>
        <p className="mt-1 text-center text-muted">
          {isHafiz
            ? 'Your revision schedule lives on the home screen — recall tests there feed this dashboard'
            : 'Complete lessons to build your review dashboard'}
        </p>
        <Link href="/" className="mt-6 rounded-xl bg-teal px-6 py-3 font-semibold text-on-teal">
          {isHafiz ? 'Revise what I know' : 'Start Learning'}
        </Link>
        <BottomNav />
      </div>
    );
  }

  // Dashboard view
  return (
    <div className="min-h-dvh bg-cream pb-24">
      {/* Sticky top bar */}
      <div className="sticky top-[var(--safe-top)] z-10 bg-cream/95 px-4 py-3 backdrop-blur-sm border-b border-foreground/5">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <Link href="/" className="text-sm text-muted hover:text-foreground">&larr; Back</Link>
          <span className="text-sm font-semibold text-teal">Review</span>
          <div className="flex items-center gap-2">
            <SettingsPanel />
            <UserButton />
          </div>
        </div>
      </div>

      <header className="px-4 pt-4 pb-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Due review banner */}
          {dueCount > 0 && (
            <button onClick={startReview} className="w-full text-left">
              <Card className="border-2 border-teal/30 bg-teal/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-teal">
                      {dueCount} lesson{dueCount !== 1 ? 's' : ''} due
                    </p>
                    <p className="text-xs text-muted">
                      {queue.overdueCount > 0 ? `${queue.overdueCount} overdue · ` : ''}
                      {dueCount > RETENTION.REVIEW_BATCH_SIZE
                        ? `In batches of ${RETENTION.REVIEW_BATCH_SIZE} — stop whenever you need`
                        : 'Tap to start your review session'}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal text-on-teal">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </Card>
            </button>
          )}

          {dueCount === 0 && lessonCards.length > 0 && (
            <Card className="bg-success/5 border border-success/20">
              <div className="text-center">
                <p className="text-sm font-bold text-success">All caught up!</p>
                <p className="mt-0.5 text-xs text-muted">No lessons due for review right now</p>
              </div>
            </Card>
          )}

          {/* Summary stats */}
          <div className="flex justify-center gap-6">
            <div className="text-center">
              <p className="text-lg font-bold text-success">{totalStrong}</p>
              <p className="text-[10px] text-muted">Strong</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gold">{totalHesitant}</p>
              <p className="text-[10px] text-muted">Shaky</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-red-400">{totalWeak}</p>
              <p className="text-[10px] text-muted">Weak</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 space-y-4">
        {/* Leeches (M5): ayahs failed several reviews in a row need isolated drilling,
            not more of the same spaced review */}
        {leeches.length > 0 && (
          <Card className="border border-miss/25">
            <p className="text-sm font-bold text-foreground">Needs focused practice</p>
            <p className="mt-0.5 text-xs text-muted">
              Missed {RETENTION.LEECH_THRESHOLD}+ reviews in a row — drill these on their own before the next review.
            </p>
            <div className="mt-2 space-y-1">
              {leeches.slice(0, 8).map((c) => {
                const surah = surahMap.get(c.surahId);
                const lesson = surahLessons[c.surahId]?.find((l) => c.ayahNumber >= l.ayahStart && c.ayahNumber <= l.ayahEnd);
                const href = lesson
                  ? `/lesson/${c.surahId}?tab=practice&reviewLesson=${lesson.lessonNumber}`
                  : `/lesson/${c.surahId}?tab=practice`;
                return (
                  <Link
                    key={`${c.surahId}:${c.ayahNumber}`}
                    href={href}
                    className="flex min-h-11 items-center justify-between rounded-lg px-2 text-sm hover:bg-foreground/5"
                  >
                    <span className="font-medium text-foreground">
                      {surah?.nameSimple ?? `Surah ${c.surahId}`} <span className="text-muted">· ayah {c.ayahNumber}</span>
                    </span>
                    <span className="text-xs text-miss">missed {c.failStreak}× in a row</span>
                  </Link>
                );
              })}
            </div>
          </Card>
        )}

        {sortedHealths.map((surahHealth) => {
          const surah = surahMap.get(surahHealth.surahId);
          if (!surah) return null;

          const surahDueCount = dueCards.filter((c) => c.surahId === surahHealth.surahId).length;
          const surahLessonCount = lessonCards.filter((c) => c.surahId === surahHealth.surahId).length;

          return (
            <SurahHealthCard
              key={surahHealth.surahId}
              surah={surah}
              health={surahHealth}
              dueCount={surahDueCount}
              onStartReview={() => startSurahReview(surahHealth.surahId)}
              onStartLessonReview={startLessonReview}
            />
          );
        })}
      </main>

      <BottomNav />
    </div>
  );
}

function SurahHealthCard({
  surah,
  health,
  dueCount,
  onStartReview,
  onStartLessonReview,
}: {
  surah: SurahMeta;
  health: SurahHealth;
  dueCount: number;
  onStartReview: () => void;
  onStartLessonReview: (lessonId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const progressLessons = useProgressStore((s) => s.lessons);

  const totalAyahs = health.totalStrong + health.totalHesitant + health.totalWeak + health.totalNotLearned;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <Card className={cn(
          'transition-all',
          health.needsAttention && 'border border-gold/20'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">{surah.nameSimple}</h3>
                {dueCount > 0 && (
                  <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal">
                    {dueCount} due
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                {health.lessons.length} lesson{health.lessons.length !== 1 ? 's' : ''}
                {health.totalWeak > 0 && <span className="text-red-400"> · {health.totalWeak} weak</span>}
                {health.totalHesitant > 0 && <span className="text-gold"> · {health.totalHesitant} shaky</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="arabic-text text-lg text-muted">{surah.nameArabic}</span>
              <span className={cn('text-muted transition-transform text-xs', expanded && 'rotate-180')}>▼</span>
            </div>
          </div>

          {/* Health bar */}
          {totalAyahs > 0 && (
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-foreground/5">
              {health.totalStrong > 0 && (
                <div className="bg-success" style={{ width: `${(health.totalStrong / totalAyahs) * 100}%` }} />
              )}
              {health.totalHesitant > 0 && (
                <div className="bg-gold" style={{ width: `${(health.totalHesitant / totalAyahs) * 100}%` }} />
              )}
              {health.totalWeak > 0 && (
                <div className="bg-red-400" style={{ width: `${(health.totalWeak / totalAyahs) * 100}%` }} />
              )}
            </div>
          )}
        </Card>
      </button>

      {/* Expanded lesson list */}
      {expanded && (
        <div className="mt-2 space-y-1.5 pl-2">
          {/* Surah review button — only when there are due lessons */}
          {dueCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onStartReview(); }}
              className="mb-2 w-full rounded-xl bg-teal/10 px-4 py-2.5 text-sm font-semibold text-teal transition-colors hover:bg-teal/20"
            >
              Review {dueCount} due lesson{dueCount !== 1 ? 's' : ''}
            </button>
          )}

          {health.lessons.map((lessonHealth) => {
            const hasIssues = lessonHealth.weakCount > 0 || lessonHealth.hesitantCount > 0;
            const allNotLearned = lessonHealth.notLearnedCount === lessonHealth.ayahs.length;
            const lessonTotal = lessonHealth.ayahs.length;
            const isComplete = progressLessons[lessonHealth.lesson.lessonId]?.completedAt != null;

            return (
              <button
                key={lessonHealth.lesson.lessonId}
                onClick={() => isComplete && onStartLessonReview(lessonHealth.lesson.lessonId)}
                disabled={!isComplete}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all',
                  hasIssues ? 'bg-card hover:shadow-md' :
                  allNotLearned ? 'bg-foreground/3 opacity-60' :
                  'bg-card hover:shadow-md'
                )}
              >
                {/* Lesson number */}
                <div className={cn(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  hasIssues ? 'bg-gold/20 text-gold' :
                  allNotLearned ? 'bg-foreground/10 text-muted' :
                  'bg-success/20 text-success'
                )}>
                  {lessonHealth.lesson.lessonNumber}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Lesson {lessonHealth.lesson.lessonNumber}
                    <span className="ml-1.5 font-normal text-muted">
                      Ayahs {lessonHealth.lesson.ayahStart}–{lessonHealth.lesson.ayahEnd}
                    </span>
                  </p>

                  {/* Mini health bar */}
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-foreground/5">
                    {lessonHealth.strongCount > 0 && (
                      <div className="bg-success" style={{ width: `${(lessonHealth.strongCount / lessonTotal) * 100}%` }} />
                    )}
                    {lessonHealth.hesitantCount > 0 && (
                      <div className="bg-gold" style={{ width: `${(lessonHealth.hesitantCount / lessonTotal) * 100}%` }} />
                    )}
                    {lessonHealth.weakCount > 0 && (
                      <div className="bg-red-400" style={{ width: `${(lessonHealth.weakCount / lessonTotal) * 100}%` }} />
                    )}
                  </div>

                  {hasIssues && (
                    <p className="mt-0.5 text-[10px] text-muted">
                      {lessonHealth.weakCount > 0 && <span className="text-red-400">{lessonHealth.weakCount} weak</span>}
                      {lessonHealth.weakCount > 0 && lessonHealth.hesitantCount > 0 && ' · '}
                      {lessonHealth.hesitantCount > 0 && <span className="text-gold">{lessonHealth.hesitantCount} shaky</span>}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
