'use client';

import { useState } from 'react';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import { SkeletonRows } from '@/components/ui/skeleton';
import { CheckIcon } from '@/components/ui/icons';
import { ReviewBadge } from '@/components/deen/review-badge';
import { SCHOOL_NAME } from '@/components/deen/positions-table';
import { useDeenStore } from '@/stores/deen-store';
import { ASK_A_SCHOLAR, SHOW_UNREVIEWED_FIQH } from '@/lib/deen/flags';
import { continuePoint, courseLessonHref, courseReview, unitProgress, type CourseUnit } from '@/lib/course/progress';
import { cn } from '@/lib/cn';
import { useCourseUnits, usePlainText } from './course-data';
import { SchoolSheet } from './school-sheet';
import { CourseComingSoon } from './coming-soon';

function ContinueCard({ units, lessonsDone }: { units: CourseUnit[]; lessonsDone: Record<string, number> }) {
  const plain = usePlainText();
  const point = continuePoint(units, lessonsDone);
  if (!point) {
    return (
      <Card className="text-center" data-course-complete>
        <p className="text-base font-semibold text-foreground">Every lesson is done</p>
        <p className="mt-1 text-sm text-muted">Your cards keep coming back in Review. Any lesson below opens again.</p>
      </Card>
    );
  }
  const n = point.unit.lessons.indexOf(point.lesson) + 1;
  return (
    <Link href={courseLessonHref(point.lesson.id)} className="block" data-continue={point.lesson.id}>
      <div className="tactile-card pressable rounded-2xl bg-teal px-5 py-4 text-on-teal">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{point.started ? 'Continue' : 'Start here'}</p>
        <p className="mt-1 text-lg font-bold leading-snug">{plain(point.lesson.title)}</p>
        <p className="mt-0.5 text-sm opacity-85">
          {point.unit.title} · Lesson {n} of {point.unit.lessons.length}
        </p>
      </div>
    </Link>
  );
}

function SchoolRow() {
  const school = useDeenStore((s) => s.school);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-card px-4 py-2" data-school-row>
        <p className="min-w-0 text-sm text-foreground">
          {school ? (
            <>
              Your school: <span className="font-semibold">{SCHOOL_NAME[school]}</span>
              <span className="block text-xs text-muted">Listed first. The others stay in view.</span>
            </>
          ) : (
            <>
              Showing <span className="font-semibold">all four schools</span>
              <span className="block text-xs text-muted">Choose yours to list it first.</span>
            </>
          )}
        </p>
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 shrink-0 px-2 text-sm font-semibold text-teal">
          {school ? 'Change' : 'Choose'}
        </button>
      </div>
      <SchoolSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function UnitSection({ unit, lessonsDone }: { unit: CourseUnit; lessonsDone: Record<string, number> }) {
  const plain = usePlainText();
  const { done, total } = unitProgress(unit, lessonsDone);
  const titleId = `unit-${unit.deck}`;
  return (
    <section aria-labelledby={titleId} className="space-y-2" data-unit={unit.deck}>
      <div className="px-1">
        <h2 id={titleId} className="text-base font-bold text-foreground">
          {unit.title}
        </h2>
        <p className="text-xs text-muted">{unit.blurb}</p>
        <div className="mt-2 flex items-center gap-3">
          <ProgressBar value={total ? (done / total) * 100 : 0} className="h-1.5 flex-1" />
          <span className="shrink-0 text-[11px] tabular-nums text-muted" data-unit-progress>
            {done} of {total} done
          </span>
        </div>
      </div>
      <ol className="overflow-hidden rounded-2xl border border-foreground/10 bg-card">
        {unit.lessons.map((l, i) => {
          const isDone = !!lessonsDone[l.id];
          return (
            <li key={l.id} className={cn(i > 0 && 'border-t border-foreground/[0.07]')}>
              <Link
                href={courseLessonHref(l.id)}
                className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/[0.03]"
                data-lesson-row={l.id}
                data-done={isDone ? '' : undefined}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                    isDone ? 'bg-teal text-on-teal' : 'bg-foreground/[0.06] text-muted',
                  )}
                  aria-hidden
                >
                  {isDone ? <CheckIcon size={14} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{plain(l.title)}</span>
                {isDone && <span className="sr-only">(done)</span>}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CourseBody() {
  const units = useCourseUnits();
  const lessonsDone = useDeenStore((s) => s.lessonsDone);

  if (!units) {
    return (
      <div aria-busy="true" aria-label="Loading the lessons">
        <SkeletonRows count={5} />
      </div>
    );
  }
  if (!units.length) return <CourseComingSoon />;

  return (
    <>
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-muted">
          Short lessons on the basics, a few minutes each. Every point shows where it comes from, and where the four schools differ you see
          all four. Take them in any order.
        </p>
        <ReviewBadge review={courseReview(units)} />
      </div>
      <ContinueCard units={units} lessonsDone={lessonsDone} />
      <SchoolRow />
      {units.map((u) => (
        <UnitSection key={u.deck} unit={u} lessonsDone={lessonsDone} />
      ))}
      <div className="space-y-1 px-1 pt-2 text-xs text-muted">
        <p className="font-medium text-foreground">{ASK_A_SCHOLAR}</p>
        <Link href="/sources#method" className="inline-flex min-h-9 items-center font-semibold text-teal">
          How the lessons are checked
        </Link>
      </div>
    </>
  );
}

/**
 * /course (all-in-one spec 2.2): the units the registry has ready, a continue
 * card, per-lesson done marks and the school choice. Self-paced: any lesson
 * opens in any order. Held back entirely while SHOW_UNREVIEWED_FIQH is false.
 */
export default function CourseHome({ showFiqh = SHOW_UNREVIEWED_FIQH }: { showFiqh?: boolean }) {
  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-course-home>
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/essentials" className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Foundations course</h1>
          <span aria-hidden />
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-5">{showFiqh ? <CourseBody /> : <CourseComingSoon />}</main>
      <BottomNav />
    </div>
  );
}
