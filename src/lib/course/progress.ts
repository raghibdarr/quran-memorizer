// Foundations course: units, lesson order and progress (all-in-one spec 2.2).
// Pure: the screens pass in what they loaded and what the deen store holds.
// The course is self-paced; any lesson opens in any order, so "progress" is only
// ever which lessons were finished, never a gate.

import type { EmittedDeck, Lesson, Review } from '@/types/deen';

/** One course unit as the screens see it: a live course deck and its lessons in order */
export interface CourseUnit {
  deck: string;
  title: string;
  blurb: string;
  lessons: Lesson[];
}

/** Whether an emitted item is a lesson (course decks hold nothing else, but be safe) */
export function isLesson(item: EmittedDeck['items'][number]): item is Lesson {
  const l = item as Partial<Lesson>;
  return typeof l.id === 'string' && typeof l.order === 'number' && Array.isArray(l.claims) && Array.isArray(l.check);
}

/** A deck's lessons in their authored order (the build emits them sorted by id) */
export function sortLessons(items: EmittedDeck['items']): Lesson[] {
  return items.filter(isLesson).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function unitFrom(info: { id: string; title: string; blurb: string }, deck: EmittedDeck | null): CourseUnit | null {
  if (!deck) return null;
  const lessons = sortLessons(deck.items);
  return lessons.length ? { deck: info.id, title: info.title, blurb: info.blurb, lessons } : null;
}

export function unitProgress(unit: CourseUnit, lessonsDone: Record<string, number>): { done: number; total: number } {
  return { done: unit.lessons.filter((l) => lessonsDone[l.id]).length, total: unit.lessons.length };
}

export function findLesson(units: CourseUnit[], lessonId: string): { unit: CourseUnit; lesson: Lesson; index: number } | null {
  for (const unit of units) {
    const index = unit.lessons.findIndex((l) => l.id === lessonId);
    if (index !== -1) return { unit, lesson: unit.lessons[index], index };
  }
  return null;
}

/** The lesson after this one in its unit, if any */
export function nextInUnit(unit: CourseUnit, lessonId: string): Lesson | null {
  const i = unit.lessons.findIndex((l) => l.id === lessonId);
  return i === -1 ? null : (unit.lessons[i + 1] ?? null);
}

export interface ContinuePoint {
  unit: CourseUnit;
  lesson: Lesson;
  /** False before any lesson is finished (the card says "Start" rather than "Continue") */
  started: boolean;
}

/**
 * Where the continue card points: after the lesson finished most recently, the
 * next unfinished lesson in that unit; else the first unfinished lesson of that
 * unit; else the first unfinished lesson anywhere. Null when every lesson is done.
 */
export function continuePoint(units: CourseUnit[], lessonsDone: Record<string, number>): ContinuePoint | null {
  const all = units.flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson })));
  const done = all.filter((x) => lessonsDone[x.lesson.id]);
  const firstOpen = (list: { unit: CourseUnit; lesson: Lesson }[]) => list.find((x) => !lessonsDone[x.lesson.id]) ?? null;

  if (!done.length) {
    const first = all[0];
    return first ? { ...first, started: false } : null;
  }
  const latest = done.reduce((a, b) => (lessonsDone[b.lesson.id] > lessonsDone[a.lesson.id] ? b : a));
  const unitLessons = latest.unit.lessons.map((lesson) => ({ unit: latest.unit, lesson }));
  const at = unitLessons.findIndex((x) => x.lesson.id === latest.lesson.id);
  const pick = firstOpen(unitLessons.slice(at + 1)) ?? firstOpen(unitLessons) ?? firstOpen(all);
  return pick ? { ...pick, started: true } : null;
}

/**
 * The status the whole course carries (spec 1.8): named reviewers only when
 * every lesson has been reviewed by a scholar, otherwise the honest default.
 */
export function courseReview(units: CourseUnit[]): Review {
  const lessons = units.flatMap((u) => u.lessons);
  const reviewed = lessons.length > 0 && lessons.every((l) => l.review.status === 'scholar-reviewed' && (l.review.by?.length ?? 0) > 0);
  if (!reviewed) return { status: 'source-checked' };
  const by = [...new Set(lessons.flatMap((l) => l.review.by ?? []))];
  return { status: 'scholar-reviewed', by };
}

/** "/course/lesson?l=<lessonId>" */
export function courseLessonHref(lessonId: string): string {
  return `/course/lesson?l=${encodeURIComponent(lessonId)}`;
}
