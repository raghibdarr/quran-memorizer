'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from '@/components/app-link';
import Button from '@/components/ui/button';
import CloseButton from '@/components/ui/close-button';
import ProgressBar from '@/components/ui/progress-bar';
import { BookIcon, CheckIcon } from '@/components/ui/icons';
import { PositionsTable, SCHOOL_NAME } from '@/components/deen/positions-table';
import { RichText } from '@/components/deen/term';
import { ReviewBadge } from '@/components/deen/review-badge';
import { ReportProblem } from '@/components/deen/report-problem';
import { sessionHref } from '@/components/deen/links';
import { useDeenStore } from '@/stores/deen-store';
import { useAppBack } from '@/hooks/use-app-back';
import { ASK_A_SCHOLAR, SHOW_UNREVIEWED_FIQH } from '@/lib/deen/flags';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import { courseLessonHref, findLesson, nextInUnit, type CourseUnit } from '@/lib/course/progress';
import {
  CLAIM_KIND_LABEL,
  addCardsLabel,
  cardsToAdd,
  clampStep,
  claimForCheck,
  isCorrect,
  lessonCardIdsFor,
  lessonSteps,
  shouldAskSchool,
} from '@/lib/course/lesson';
import type { Lesson } from '@/types/deen';
import { useCourseUnits, usePlainText } from './course-data';
import { EvidenceList } from './evidence-list';
import { SchoolSheet, schoolAskedBefore } from './school-sheet';
import { CourseComingSoon } from './coming-soon';

// ---- Where a lesson is up to, kept for the tab session so a trip to the reader and back resumes it

interface Saved {
  step: number;
  answers: Record<number, number>;
}
const savedKey = (lessonId: string) => `takrar-course-lesson:${lessonId}`;

function readSaved(lesson: Lesson): Saved {
  try {
    const raw = JSON.parse(sessionStorage.getItem(savedKey(lesson.id)) ?? 'null') as Partial<Saved> | null;
    const answers: Record<number, number> = {};
    for (const [k, v] of Object.entries(raw?.answers ?? {})) {
      const i = Number(k);
      if (lesson.check[i] && Number.isInteger(v) && v >= 0 && v < lesson.check[i].options.length) answers[i] = v;
    }
    return { step: clampStep(raw?.step, lesson), answers };
  } catch {
    return { step: 0, answers: {} };
  }
}

function writeSaved(lessonId: string, saved: Saved | null) {
  try {
    if (saved) sessionStorage.setItem(savedKey(lessonId), JSON.stringify(saved));
    else sessionStorage.removeItem(savedKey(lessonId));
  } catch {
    // Storage blocked: the lesson simply starts from the top next time
  }
}

// ---- Pieces

function Header({ title, progress }: { title: string; progress: number | null }) {
  return (
    <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 backdrop-blur-sm">
      <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 px-4 py-3">
        <CloseButton fallback="/course" label="Close lesson" className="justify-self-start" />
        <p className="truncate text-center text-sm font-semibold text-teal">{title}</p>
        <span aria-hidden />
      </div>
      {progress !== null && <ProgressBar value={progress} className="h-1 rounded-none bg-foreground/[0.06]" />}
    </div>
  );
}

function Footer({ deck, lesson }: { deck: string; lesson: Lesson }) {
  return (
    <footer className="mt-8 space-y-1 border-t border-foreground/10 pt-4 text-center" data-lesson-footer>
      <p className="text-sm font-medium text-foreground">{ASK_A_SCHOLAR}</p>
      <ReportProblem itemId={`${deck}:${lesson.id}`} rev={lesson.rev} title={lesson.title} />
    </footer>
  );
}

/** The one primary action, pinned to the bottom so it is always in reach */
function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 bg-gradient-to-t from-cream from-70% to-cream/0 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Message({ title, children }: { title: string; children?: ReactNode }) {
  const back = useAppBack('/course');
  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center text-center">
      <div className="w-full max-w-sm space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal/10 text-teal">
          <BookIcon size={24} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
          {children && <p className="mt-1.5 text-sm text-muted">{children}</p>}
        </div>
        <Button variant="ghost" onClick={back}>
          Back to the course
        </Button>
      </div>
    </div>
  );
}

// ---- The lesson

function LessonFlow({ unit, lesson, index }: { unit: CourseUnit; lesson: Lesson; index: number }) {
  const plain = usePlainText();
  const steps = lessonSteps(lesson);
  const [saved, setSaved] = useState<Saved>(() => readSaved(lesson));
  const [finished, setFinished] = useState<{ added: number } | null>(null);
  const school = useDeenStore((s) => s.school);
  const cards = useDeenStore((s) => s.cards);
  const doneCount = useDeenStore((s) => Object.keys(s.lessonsDone).length);
  const addCards = useDeenStore((s) => s.addCards);
  const markLessonDone = useDeenStore((s) => s.markLessonDone);
  const [askSchool, setAskSchool] = useState(() => shouldAskSchool(school, schoolAskedBefore(), doneCount));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  const { step, answers } = saved;
  const current = steps[step];

  useEffect(() => {
    if (!finished) writeSaved(lesson.id, saved);
  }, [lesson.id, saved, finished]);

  // Each step starts at the top with its heading focused (not on first paint)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, finished]);

  const go = (to: number) => setSaved((s) => ({ ...s, step: Math.min(Math.max(to, 0), steps.length - 1) }));
  const answer = (q: number, option: number) => {
    if (answers[q] !== undefined) return;
    if (isCorrect(lesson.check[q], option)) haptic.success();
    else haptic.selection();
    setSaved((s) => ({ ...s, answers: { ...s.answers, [q]: option } }));
  };

  const ids = lessonCardIdsFor(unit.deck, lesson, school);
  const toAdd = ids.filter((id) => !cards[id]).length;
  const hasSchoolCards = lesson.claims.some((c) => c.cards.some((k) => k.school));

  const finish = (add: boolean) => {
    const fresh = add ? cardsToAdd(unit.deck, lesson, school, cards) : {};
    const n = Object.keys(fresh).length;
    if (n) addCards(fresh);
    markLessonDone(lesson.id);
    writeSaved(lesson.id, null);
    haptic.success();
    setFinished({ added: n });
  };

  const next = nextInUnit(unit, lesson.id);
  const heading = (text: ReactNode, className?: string) => (
    <h1 ref={headingRef} tabIndex={-1} className={cn('font-bold leading-snug text-foreground outline-none', className)}>
      {text}
    </h1>
  );

  let body: ReactNode;
  let actions: ReactNode;

  if (finished) {
    body = (
      <div className="space-y-5 pt-6 text-center" data-lesson-done>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal text-on-teal">
          <CheckIcon size={26} />
        </div>
        <div className="space-y-1.5">
          {heading('Lesson done', 'text-xl')}
          <p className="text-sm text-muted" role="status">
            {finished.added > 0
              ? `${finished.added} ${finished.added === 1 ? 'card' : 'cards'} added. They come up in Review.`
              : 'Come back to it whenever you like.'}
          </p>
        </div>
        {finished.added > 0 && (
          <Link href={sessionHref(unit.deck)} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
            Review them now
          </Link>
        )}
      </div>
    );
    actions = next ? (
      <>
        <Link href="/course" className="inline-flex min-h-12 items-center rounded-xl px-4 text-sm font-semibold text-muted hover:text-foreground">
          The course
        </Link>
        <Link href={courseLessonHref(next.id)} className="tactile-btn flex min-h-12 flex-1 items-center justify-center rounded-xl bg-teal px-4 text-center text-sm font-semibold text-on-teal" data-next-lesson>
          Next: {plain(next.title)}
        </Link>
      </>
    ) : (
      <Link href="/course" className="tactile-btn flex min-h-12 flex-1 items-center justify-center rounded-xl bg-teal px-4 text-sm font-semibold text-on-teal">
        Back to the course
      </Link>
    );
  } else if (current.kind === 'intro') {
    body = (
      <div className="space-y-4" data-lesson-step="intro">
        <p className="text-xs font-semibold text-muted">
          {unit.title} · Lesson {index + 1} of {unit.lessons.length}
        </p>
        {heading(plain(lesson.title), 'text-2xl')}
        <p className="text-[15px] leading-relaxed text-foreground">
          <RichText text={lesson.intro} />
        </p>
        <p className="text-sm text-muted">
          {lesson.claims.length} {lesson.claims.length === 1 ? 'point' : 'points'}, then {lesson.check.length} quick questions.
        </p>
        <ReviewBadge review={lesson.review} />
      </div>
    );
    actions = (
      <Button className="min-h-12 flex-1" onClick={() => go(step + 1)}>
        Start
      </Button>
    );
  } else if (current.kind === 'claim') {
    const claim = lesson.claims[current.index];
    body = (
      <div className="space-y-5" data-lesson-step="claim" data-claim={claim.id} data-claim-kind={claim.kind}>
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted">
            <span>
              Point {current.index + 1} of {lesson.claims.length}
            </span>
            <span aria-hidden>·</span>
            <span className={cn(claim.kind === 'differs' ? 'text-gold-deep' : 'text-teal')}>{CLAIM_KIND_LABEL[claim.kind]}</span>
          </p>
          {heading(<RichText text={claim.text} />, 'text-lg font-semibold')}
        </div>
        <EvidenceList evidence={claim.evidence} claimKind={claim.kind} />
        {claim.positions && claim.positions.length > 0 && (
          <div className="space-y-2" data-positions>
            <p className="text-xs font-semibold text-muted">{claim.kind === 'differs' ? 'What each school holds' : 'In the primers'}</p>
            <PositionsTable positions={claim.positions} school={school} />
          </div>
        )}
      </div>
    );
    actions = (
      <>
        <Button variant="ghost" className="min-h-12 px-4" onClick={() => go(step - 1)}>
          Back
        </Button>
        <Button className="min-h-12 flex-1" onClick={() => go(step + 1)}>
          Next
        </Button>
      </>
    );
  } else if (current.kind === 'check') {
    const q = lesson.check[current.index];
    const chosen = answers[current.index];
    const answered = chosen !== undefined;
    const claim = claimForCheck(lesson, q);
    body = (
      <div className="space-y-5" data-lesson-step="check" data-check={current.index}>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted">
            Question {current.index + 1} of {lesson.check.length} · not scored
          </p>
          {heading(<RichText text={q.q} />, 'text-lg font-semibold')}
        </div>
        <ul className="space-y-2" aria-label="Answers">
          {q.options.map((o, i) => {
            const right = answered && i === q.answer;
            const wrongPick = answered && i === chosen && i !== q.answer;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={answered}
                  aria-pressed={chosen === i}
                  onClick={() => answer(current.index, i)}
                  data-option={i}
                  data-correct={right ? '' : undefined}
                  className={cn(
                    'flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-[15px] transition-colors',
                    !answered && 'border-foreground/15 bg-card text-foreground hover:bg-foreground/[0.04]',
                    right && 'border-teal bg-teal/10 font-semibold text-foreground',
                    wrongPick && 'border-gold/60 bg-gold/10 text-foreground',
                    answered && !right && !wrongPick && 'border-foreground/10 bg-card text-muted',
                  )}
                >
                  <span>{plain(o)}</span>
                  {right && <CheckIcon size={16} className="shrink-0 text-teal" />}
                </button>
              </li>
            );
          })}
        </ul>
        {answered && (
          <div className="animate-[phase-in_200ms_ease-out] space-y-2 rounded-xl bg-foreground/[0.04] px-4 py-3" role="status" data-check-feedback>
            <p className="text-sm font-semibold text-foreground">
              {isCorrect(q, chosen) ? 'That’s right.' : `Not quite. It’s “${plain(q.options[q.answer])}”.`}
            </p>
            {claim && (
              <p className="text-sm leading-relaxed text-muted">
                From the lesson: <RichText text={claim.text} />
              </p>
            )}
          </div>
        )}
      </div>
    );
    actions = (
      <>
        <Button variant="ghost" className="min-h-12 px-4" onClick={() => go(step - 1)}>
          Back
        </Button>
        <Button className="min-h-12 flex-1" disabled={!answered} onClick={() => go(step + 1)}>
          {answered ? 'Next' : 'Pick an answer'}
        </Button>
      </>
    );
  } else {
    body = (
      <div className="space-y-4" data-lesson-step="finish">
        {heading('Keep it with you', 'text-xl')}
        <p className="text-[15px] leading-relaxed text-foreground">
          {ids.length === 0
            ? 'This lesson has no review cards.'
            : toAdd > 0
              ? `${toAdd === 1 ? 'One short card' : `${toAdd} short cards`} from this lesson can join your reviews, so it comes back to you over the next weeks.`
              : 'This lesson’s cards are already in your reviews.'}
        </p>
        {hasSchoolCards &&
          (school ? (
            <p className="text-sm leading-relaxed text-muted">
              Where the schools differ, the card added is the {SCHOOL_NAME[school]} position, with the others on its back.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              With no school chosen, the cards cover what the lesson shares across the schools.{' '}
              <button type="button" onClick={() => setAskSchool(true)} className="font-semibold text-teal underline-offset-2 hover:underline">
                Choose a school
              </button>{' '}
              to add its positions too.
            </p>
          ))}
      </div>
    );
    actions =
      toAdd > 0 ? (
        <>
          <Button variant="ghost" className="min-h-12 px-3 text-sm" onClick={() => finish(false)}>
            Not now
          </Button>
          <Button className="min-h-12 flex-1" onClick={() => finish(true)} data-add-cards>
            {addCardsLabel(toAdd)}
          </Button>
        </>
      ) : (
        <Button className="min-h-12 flex-1" onClick={() => finish(false)}>
          Finish
        </Button>
      );
  }

  const progress = finished ? 100 : (step / (steps.length - 1)) * 100;

  return (
    <>
      <Header title={unit.title} progress={progress} />
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-2xl flex-col px-4 pt-6" data-lesson={lesson.id}>
        <div key={finished ? 'done' : step} className="flex-1 animate-[phase-in_250ms_ease-out]">
          {body}
        </div>
        <ActionBar>{actions}</ActionBar>
        <Footer deck={unit.deck} lesson={lesson} />
      </main>
      <SchoolSheet open={askSchool} onClose={() => setAskSchool(false)} />
    </>
  );
}

/**
 * /course/lesson?l=<lessonId> (all-in-one spec 2.2): a short intro, then the
 * lesson's points one at a time with their evidence and, where the schools
 * differ, all four positions; a few unscored questions; then the lesson's
 * cards join the review queue. The school question is asked once.
 */
export default function LessonPlayer({ showFiqh = SHOW_UNREVIEWED_FIQH }: { showFiqh?: boolean }) {
  const lessonId = useSearchParams().get('l') ?? '';
  const units = useCourseUnits();

  let content: ReactNode;
  if (!showFiqh) {
    content = (
      <>
        <Header title="Foundations course" progress={null} />
        <main className="mx-auto max-w-2xl px-4 pt-5">
          <CourseComingSoon />
        </main>
      </>
    );
  } else if (!units) {
    content = (
      <>
        <Header title="Lesson" progress={null} />
        <div className="flex items-center justify-center py-20" aria-label="Loading the lesson">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent motion-reduce:animate-none" />
        </div>
      </>
    );
  } else {
    const found = findLesson(units, lessonId);
    content = found ? (
      <LessonFlow key={found.lesson.id} unit={found.unit} lesson={found.lesson} index={found.index} />
    ) : (
      <>
        <Header title="Lesson" progress={null} />
        <main className="mx-auto max-w-2xl px-4">
          <Message title="This lesson isn't available">It may have moved, or it isn&apos;t ready yet.</Message>
        </main>
      </>
    );
  }

  return <div className="min-h-dvh bg-cream" data-course-lesson>{content}</div>;
}
