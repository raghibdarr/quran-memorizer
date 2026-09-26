'use client';

import Link from 'next/link';

import { useEffect, useMemo, useState } from 'react';
import type { JuzMeta, SurahMeta } from '@/types/quran';
import { usePlanStore } from '@/stores/plan-store';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { getJuzIndex, getSurahIndex } from '@/lib/quran-data';
import {
  computePlanProgress,
  computeTodaysPlan,
  getPlanLessons,
  todayIso,
  startOfTodayMs,
} from '@/lib/plan';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import { ArrowRightIcon, BookIcon, CheckIcon, RefreshIcon, StarIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { lessonHref } from '@/lib/routes';

export default function TodaysPlanCard() {
  const plan = usePlanStore((s) => s.plan);
  const applyCatchUp = usePlanStore((s) => s.applyCatchUp);
  const setKnownTracking = usePlanStore((s) => s.setKnownTracking);
  const progressLessons = useProgressStore((s) => s.lessons);
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const seedKnownAyahs = useReviewStore((s) => s.seedKnownAyahs);

  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);

  useEffect(() => {
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, []);

  const planLessons = useMemo(() => {
    if (!plan || !allSurahs.length || !juzIndex.length) return [];
    return getPlanLessons(plan, allSurahs, juzIndex);
  }, [plan, allSurahs, juzIndex]);

  const dueReviews = useMemo(() => {
    const now = Date.now();
    return lessonCards.filter((c) => c.nextReview <= now);
  }, [lessonCards]);

  const surahById = useMemo(() => new Map(allSurahs.map((s) => [s.id, s])), [allSurahs]);

  const todaysPlan = useMemo(() => {
    if (!plan || !allSurahs.length) return null;
    return computeTodaysPlan(plan, planLessons, progressLessons, dueReviews, allSurahs);
  }, [plan, planLessons, progressLessons, dueReviews, allSurahs]);

  const progress = useMemo(() => {
    // Maintain plans have zero lessons by design — the card must still render
    if (!plan || !planLessons.length) return null;
    return computePlanProgress(plan, planLessons, progressLessons);
  }, [plan, planLessons, progressLessons]);

  if (!plan || !todaysPlan) return null;

  // M4 semantics change gate: legacy plans with known surahs opt IN to tracking
  const showKnownBanner = plan.knownTracking === undefined && plan.knownSurahIds.length > 0;
  const enableKnownTracking = () => {
    const byId = new Map(allSurahs.map((s) => [s.id, s]));
    for (const id of plan.knownSurahIds) {
      const surah = byId.get(id);
      if (surah) seedKnownAyahs(id, 1, surah.versesCount);
    }
    setKnownTracking(true);
  };

  const reviewCount = todaysPlan.reviews.length;
  const revisionCount = todaysPlan.revisions.length;
  const newLessonCount = todaysPlan.newLessons.length;
  const completedCount = todaysPlan.completedNewLessonIds.length;

  const totalTasks = reviewCount + revisionCount + newLessonCount;
  const doneTasks =
    (reviewCount === 0 ? 1 : 0) * 0 /* reviews batch-link */ +
    completedCount;
  // Reviews page handles reviews as a batch — we show a single "Review X lessons" item
  // Keep simple: tasks remaining = reviews (batched) + revisions + incomplete new lessons
  const itemsRemaining =
    (reviewCount > 0 ? 1 : 0) + revisionCount + (newLessonCount - completedCount);

  const allDone =
    reviewCount === 0 &&
    revisionCount === 0 &&
    (newLessonCount === 0 || completedCount === newLessonCount);

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Today&apos;s Plan</p>
          <p className="mt-0.5 text-base font-bold text-foreground">
            {todaysPlan.isRestDay
              ? 'Rest day'
              : allDone
                ? 'All done for today'
                : `${itemsRemaining} ${itemsRemaining === 1 ? 'task' : 'tasks'} left`}
          </p>
        </div>
        <Link
          href="/plan"
          className="text-[11px] font-semibold text-teal hover:underline"
        >
          Manage
        </Link>
      </div>

      {/* Overall progress (maintain plans have no lesson track) */}
      {progress && (
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>{progress.completedLessons} / {progress.totalLessons} lessons</span>
          <span>{progress.percentage}%</span>
        </div>
        <ProgressBar value={progress.percentage} className="mt-1" />
      </div>
      )}

      {showKnownBanner && (
        <div className="mt-3 rounded-lg bg-teal/5 border border-teal/20 px-3 py-2.5">
          <p className="text-xs font-semibold text-foreground">
            Track your {plan.knownSurahIds.length} known surah{plan.knownSurahIds.length === 1 ? '' : 's'} for revision?
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            They&apos;ll join your revision schedule at &quot;shaky&quot; strength — recall tests keep them from fading.
            (You can export a backup first from Settings.)
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={enableKnownTracking}
              className="rounded-full bg-teal px-3 py-1 text-[11px] font-semibold text-on-teal hover:brightness-110"
            >
              Track them
            </button>
            <button
              onClick={() => setKnownTracking(false)}
              className="rounded-full px-3 py-1 text-[11px] font-semibold text-muted hover:text-foreground"
            >
              Keep them out
            </button>
          </div>
        </div>
      )}

      {progress && progress.lessonsBehind > 0 && !todaysPlan.isRestDay && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold">
          <span>
            {progress.lessonsBehind} {progress.lessonsBehind === 1 ? 'lesson' : 'lessons'} behind schedule
          </span>
          {plan.catchUpDate === todayIso() && (plan.catchUpBonus ?? 0) > 0 ? (
            <span className="font-semibold">+{plan.catchUpBonus} today</span>
          ) : (
            <button
              onClick={() => applyCatchUp(progress.lessonsBehind, todayIso())}
              className="rounded-full bg-gold px-3 py-1 text-[11px] font-semibold text-on-gold hover:brightness-110"
            >
              Catch up today
            </button>
          )}
        </div>
      )}

      {/* Checklist */}
      <div className="mt-3 space-y-1.5">
        {reviewCount > 0 && (
          <Link
            href="/review?start=1"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-foreground/5"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-teal/40 text-teal">
              <RefreshIcon size={11} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                Review {reviewCount} {reviewCount === 1 ? 'lesson' : 'lessons'}
              </p>
              <p className="text-[11px] text-muted">
                {(() => {
                  const overdue = todaysPlan.reviews.filter((c) => c.nextReview < startOfTodayMs()).length;
                  return overdue > 0
                    ? `${reviewCount - overdue} due today · ${overdue} overdue`
                    : 'Spaced repetition — due today';
                })()}
              </p>
            </div>
            <ArrowRightIcon size={14} className="shrink-0 text-muted" />
          </Link>
        )}

        {todaysPlan.revisions.map((rev) => (
          <Link
            key={`rev-${rev.surahId}`}
            href={`/plan/revise/${rev.surahId}`}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-foreground/5"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gold/40 text-gold">
              <StarIcon size={11} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                Revise {rev.surahName}
                {rev.isPartial && (
                  <span className="ml-1 text-[11px] font-normal text-muted">
                    · ayahs {rev.ayahStart}–{rev.ayahEnd}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted">
                {rev.isPartial ? 'Plan-scope recall' : 'Full-surah recall'}
                {rev.daysSinceRevision !== Infinity && ` · ${rev.daysSinceRevision}d since last`}
              </p>
            </div>
            <ArrowRightIcon size={14} className="shrink-0 text-muted" />
          </Link>
        ))}

        {todaysPlan.newLessons.map((lesson) => {
          const surah = surahById.get(lesson.surahId);
          const done = todaysPlan.completedNewLessonIds.includes(lesson.lessonId);
          return (
            <Link
              key={lesson.lessonId}
              href={lessonHref(lesson.surahId, lesson.lessonNumber)}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-foreground/5',
                done && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                  done
                    ? 'border-success bg-success text-on-success'
                    : 'border-teal/40 text-teal',
                )}
              >
                {done ? <CheckIcon size={11} /> : <BookIcon size={11} />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-semibold text-foreground',
                    done && 'line-through',
                  )}
                >
                  Learn {surah?.nameSimple ?? `Surah ${lesson.surahId}`}
                  {lesson.lessonNumber > 1 || !surah || lesson.ayahCount < surah.versesCount
                    ? ` · L${lesson.lessonNumber}`
                    : ''}
                </p>
                <p className="text-[11px] text-muted">
                  Ayahs {lesson.ayahStart}–{lesson.ayahEnd}
                </p>
              </div>
              <ArrowRightIcon size={14} className="shrink-0 text-muted" />
            </Link>
          );
        })}

        {todaysPlan.isRestDay && reviewCount === 0 && (
          <p className="px-3 py-2 text-xs text-muted">
            No reviews due. Enjoy your rest day.
          </p>
        )}

        {!todaysPlan.isRestDay && totalTasks === 0 && (
          <p className="px-3 py-2 text-xs text-muted">
            {plan.goalType === 'maintain'
              ? 'Nothing due today — your revision cycle is up to date.'
              : 'Plan complete. Reviews will continue automatically.'}
          </p>
        )}
      </div>
    </Card>
  );
}
