'use client';

import Link from 'next/link';

import { useMemo } from 'react';
import { usePlanStore } from '@/stores/plan-store';
import { useReviewStore } from '@/stores/review-store';
import { todayIso, startOfTodayMs } from '@/lib/plan';
import { useTodaysPlan } from '@/hooks/use-todays-plan';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import { ArrowRightIcon, BookIcon, CheckIcon, RefreshIcon, StarIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { lessonHref } from '@/lib/routes';

export default function TodaysPlanCard() {
  const applyCatchUp = usePlanStore((s) => s.applyCatchUp);
  const setKnownTracking = usePlanStore((s) => s.setKnownTracking);
  const seedKnownAyahs = useReviewStore((s) => s.seedKnownAyahs);
  // progress is null for maintain plans (zero lessons by design) — the card still renders
  const { plan, todaysPlan, progress, allSurahs, dayStatus } = useTodaysPlan();

  const surahById = useMemo(() => new Map(allSurahs.map((s) => [s.id, s])), [allSurahs]);

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

  const sabqiCount = todaysPlan.sabqi.length;
  const manzilReviewCount = todaysPlan.manzil.length;
  const revisionCount = todaysPlan.revisions.length;
  const newLessonCount = todaysPlan.newLessons.length;
  const completedCount = todaysPlan.completedNewLessonIds.length;
  const earlyCount = todaysPlan.earlyReviewIds.length;
  const todayStart = startOfTodayMs();
  const manzilOverdue = todaysPlan.manzil.filter((c) => c.nextReview < todayStart).length;
  const sabqiOverdue = todaysPlan.sabqi.filter((c) => c.nextReview < todayStart).length;

  const totalTasks = sabqiCount + manzilReviewCount + revisionCount + newLessonCount;
  // Each review stream is one batched row (the review page runs it as a session)
  const itemsRemaining =
    (sabqiCount > 0 ? 1 : 0) + (manzilReviewCount > 0 ? 1 : 0) + revisionCount + (newLessonCount - completedCount);
  const revisionPending = sabqiCount + manzilReviewCount + revisionCount > 0;

  // THE shared definition (src/lib/day-status.ts) — same as the home ring
  const allDone = dayStatus.remaining === 0;

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
        {/* Plan dashboard entry — a real tap target, not an 11px link (M6, audit m16) */}
        <Link
          href="/plan"
          className="pressable -my-1 flex min-h-11 items-center gap-1 rounded-full border border-teal/25 px-3 text-xs font-semibold text-teal hover:bg-teal/5"
        >
          Your plan
          <ArrowRightIcon size={12} />
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

      {/* Checklist — the three streams of the hifdh cycle, revision before new (M5) */}
      <div className="mt-3 space-y-3">
        {sabqiCount > 0 && (
          <section>
            <StreamLabel name="Sabqi" hint="Keep the last two weeks fresh" />
            <ReviewRow
              href="/review?start=1&stream=sabqi"
              title={`Review ${sabqiCount} recent ${sabqiCount === 1 ? 'lesson' : 'lessons'}`}
              sub={reviewBreakdown(sabqiCount - earlyCount - sabqiOverdue, sabqiOverdue, earlyCount)}
            />
          </section>
        )}

        {(manzilReviewCount > 0 || revisionCount > 0) && (
          <section>
            <StreamLabel name="Manzil" hint="Cycle everything older so nothing fades" />
            {manzilReviewCount > 0 && (
              <ReviewRow
                href="/review?start=1&stream=manzil"
                title={`Review ${manzilReviewCount} older ${manzilReviewCount === 1 ? 'lesson' : 'lessons'}`}
                sub={reviewBreakdown(manzilReviewCount - manzilOverdue, manzilOverdue, 0)}
              />
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
          </section>
        )}

        {newLessonCount > 0 && (
          <section>
            <StreamLabel
              name="Sabaq"
              hint={revisionPending && completedCount < newLessonCount ? 'New memorization — best after the revision above' : 'Today’s new memorization'}
            />
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
          </section>
        )}

        {todaysPlan.isRestDay && sabqiCount + manzilReviewCount === 0 && (
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

/** "3 due today · 7 overdue · 2 quick check-ins" — zero parts omitted */
function reviewBreakdown(dueToday: number, overdue: number, early: number): string {
  return [
    dueToday > 0 && `${dueToday} due today`,
    overdue > 0 && `${overdue} overdue`,
    early > 0 && `${early} quick check-in${early === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');
}

/** Stream header: the traditional name plus a one-line in-context explanation */
function StreamLabel({ name, hint }: { name: string; hint: string }) {
  return (
    <p className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
      {name} <span className="font-normal normal-case tracking-normal text-muted/80">· {hint}</span>
    </p>
  );
}

function ReviewRow({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-foreground/5"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-teal/40 text-teal">
        <RefreshIcon size={11} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {sub && <p className="text-[11px] text-muted">{sub}</p>}
      </div>
      <ArrowRightIcon size={14} className="shrink-0 text-muted" />
    </Link>
  );
}
