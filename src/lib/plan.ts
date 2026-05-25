import type {
  HifdhPlan,
  LessonDef,
  LessonProgress,
  LessonReviewCard,
  JuzMeta,
  SurahMeta,
  TodaysPlan,
  PlanProgress,
  SurahRevisionTask,
} from '@/types/quran';
import { CURRICULUM_ORDER, generateLessonsWithJuzBoundaries } from './curriculum';

// ---------- Date helpers ----------

const MS_PER_DAY = 86_400_000;

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Parse a YYYY-MM-DD string as a UTC Date at midnight, for safe arithmetic. */
function isoToDateUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dateUTCToIso(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Number of calendar days from `fromIso` to `toIso` (toIso - fromIso). Negative if toIso is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToDateUTC(toIso).getTime() - isoToDateUTC(fromIso).getTime()) / MS_PER_DAY);
}

export function isStudyDay(dateIso: string, studyDays: number[]): boolean {
  const dow = isoToDateUTC(dateIso).getUTCDay();
  return studyDays.includes(dow);
}

/** How many study days exist in [fromIso, toIso] inclusive. */
export function countStudyDays(fromIso: string, toIso: string, studyDays: number[]): number {
  const total = daysBetween(fromIso, toIso) + 1;
  if (total <= 0) return 0;
  const set = new Set(studyDays);
  let count = 0;
  const cursor = isoToDateUTC(fromIso);
  for (let i = 0; i < total; i++) {
    if (set.has(cursor.getUTCDay())) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** Add N calendar days to an ISO date. */
export function addDaysIso(iso: string, days: number): string {
  const d = isoToDateUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateUTCToIso(d);
}

// ---------- Goal resolution ----------

function surahsInJuz(juzNumbers: number[], juzIndex: JuzMeta[]): number[] {
  const ids = new Set<number>();
  for (const juz of juzIndex) {
    if (!juzNumbers.includes(juz.juzNumber)) continue;
    for (const m of juz.verseMappings) ids.add(m.surahId);
  }
  return Array.from(ids);
}

/** Resolve the list of surah ids in the plan's scope, ordered by curriculum. */
export function resolveGoalSurahIds(
  goalType: HifdhPlan['goalType'],
  params: { surahIds?: number[]; juzNumbers?: number[] },
  juzIndex: JuzMeta[],
): number[] {
  let ids: number[];
  if (goalType === 'full-quran') {
    ids = Array.from({ length: 114 }, (_, i) => i + 1);
  } else if (goalType === 'juz') {
    ids = surahsInJuz(params.juzNumbers ?? [], juzIndex);
  } else {
    ids = params.surahIds ?? [];
  }
  const order = new Map<number, number>();
  CURRICULUM_ORDER.forEach((id, i) => order.set(id, i));
  return [...new Set(ids)].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

// ---------- Lesson enumeration ----------

function juzSegmentsFor(surahId: number, juzIndex: JuzMeta[]) {
  const out: Array<{ juzNumber: number; ayahStart: number; ayahEnd: number }> = [];
  for (const juz of juzIndex) {
    for (const m of juz.verseMappings) {
      if (m.surahId === surahId) {
        out.push({ juzNumber: juz.juzNumber, ayahStart: m.ayahStart, ayahEnd: m.ayahEnd });
      }
    }
  }
  return out.sort((a, b) => a.ayahStart - b.ayahStart);
}

/**
 * All lessons in the plan, ordered by curriculum. Filtered by juz selection for juz goals,
 * and excluding known surahs.
 */
export function getPlanLessons(
  plan: HifdhPlan,
  allSurahs: SurahMeta[],
  juzIndex: JuzMeta[],
): LessonDef[] {
  const byId = new Map(allSurahs.map((s) => [s.id, s]));
  const known = new Set(plan.knownSurahIds);
  const knownLessons = new Set(plan.knownLessonIds ?? []);
  const juzFilter = plan.goalType === 'juz' ? new Set(plan.goalJuzNumbers) : null;

  const lessons: LessonDef[] = [];
  for (const surahId of plan.goalSurahIds) {
    if (known.has(surahId)) continue;
    const surah = byId.get(surahId);
    if (!surah) continue;
    const segs = juzSegmentsFor(surahId, juzIndex);
    let surahLessons = generateLessonsWithJuzBoundaries(surahId, surah.versesCount, segs);
    if (juzFilter) surahLessons = surahLessons.filter((l) => juzFilter.has(l.juzNumber));
    if (knownLessons.size > 0) surahLessons = surahLessons.filter((l) => !knownLessons.has(l.lessonId));
    lessons.push(...surahLessons);
  }
  return lessons;
}

// ---------- Today's plan ----------

/**
 * Today's new lessons: the next `lessonsPerDay` lessons, including any plan lessons
 * completed earlier today so the user sees a stable checklist.
 */
export function getTodaysNewLessons(
  plan: HifdhPlan,
  planLessons: LessonDef[],
  progressLessons: Record<string, LessonProgress>,
  dayStartMs: number,
): { all: LessonDef[]; completedIds: string[] } {
  const completedToday: LessonDef[] = [];
  const incomplete: LessonDef[] = [];

  for (const l of planLessons) {
    const p = progressLessons[l.lessonId];
    if (p?.completedAt) {
      if (p.completedAt >= dayStartMs) completedToday.push(l);
    } else {
      incomplete.push(l);
    }
  }

  const bonus = plan.catchUpDate === todayIso() ? (plan.catchUpBonus ?? 0) : 0;
  const target = plan.lessonsPerDay + bonus;
  const slots = Math.max(0, target - completedToday.length);
  const all = [...completedToday, ...incomplete.slice(0, slots)];
  const completedIds = completedToday.map((l) => l.lessonId);
  return { all, completedIds };
}

/** Surahs fully completed within the plan. */
export function getCompletedPlanSurahs(
  plan: HifdhPlan,
  planLessons: LessonDef[],
  progressLessons: Record<string, LessonProgress>,
): number[] {
  const bySurah = new Map<number, LessonDef[]>();
  for (const l of planLessons) {
    if (!bySurah.has(l.surahId)) bySurah.set(l.surahId, []);
    bySurah.get(l.surahId)!.push(l);
  }
  const done: number[] = [];
  for (const [surahId, lessons] of bySurah) {
    const allDone = lessons.every((l) => progressLessons[l.lessonId]?.completedAt);
    if (allDone) done.push(surahId);
  }
  return done;
}

/**
 * Pick a revision frequency automatically based on how many surahs are already
 * complete in the plan. Matches the dashboard helper tiers.
 */
export function autoRevisionFrequencyDays(completedSurahCount: number): number {
  if (completedSurahCount <= 5) return 3;
  if (completedSurahCount <= 15) return 7;
  return 14;
}

/** Effective revision frequency considering the auto flag. */
export function effectiveRevisionFrequency(plan: HifdhPlan, completedSurahCount: number): number {
  return plan.revisionFrequencyAuto
    ? autoRevisionFrequencyDays(completedSurahCount)
    : plan.revisionFrequencyDays;
}

/** Surah revisions due today (completed surahs past the revision interval). */
export function getRevisionTasks(
  plan: HifdhPlan,
  planLessons: LessonDef[],
  progressLessons: Record<string, LessonProgress>,
  allSurahs: SurahMeta[],
  now: number,
): SurahRevisionTask[] {
  const completedSurahs = getCompletedPlanSurahs(plan, planLessons, progressLessons);
  const byId = new Map(allSurahs.map((s) => [s.id, s]));
  const frequency = effectiveRevisionFrequency(plan, completedSurahs.length);
  const thresholdMs = frequency * MS_PER_DAY;

  // Map surahId -> latest lesson completion time (fallback start for revision timer)
  const surahCompletionTs = new Map<number, number>();
  // Map surahId -> list of planLessons for that surah (for scope computation)
  const surahLessons = new Map<number, LessonDef[]>();
  for (const l of planLessons) {
    const ts = progressLessons[l.lessonId]?.completedAt;
    if (ts) {
      const cur = surahCompletionTs.get(l.surahId) ?? 0;
      if (ts > cur) surahCompletionTs.set(l.surahId, ts);
    }
    if (!surahLessons.has(l.surahId)) surahLessons.set(l.surahId, []);
    surahLessons.get(l.surahId)!.push(l);
  }

  const tasks: SurahRevisionTask[] = [];
  for (const surahId of completedSurahs) {
    const surah = byId.get(surahId);
    if (!surah) continue;
    const explicitLast = plan.lastRevisedAt[surahId];
    const effectiveLast = explicitLast ?? surahCompletionTs.get(surahId) ?? now;
    const elapsed = now - effectiveLast;
    if (elapsed < thresholdMs) continue;

    const scope = surahLessons.get(surahId) ?? [];
    const ayahStart = scope.reduce((min, l) => Math.min(min, l.ayahStart), Infinity);
    const ayahEnd = scope.reduce((max, l) => Math.max(max, l.ayahEnd), 0);
    const scopedAyahCount = ayahEnd - ayahStart + 1;
    const isPartial = scopedAyahCount < surah.versesCount;

    tasks.push({
      surahId,
      surahName: surah.nameSimple,
      lastRevised: explicitLast ?? null,
      daysSinceRevision: Math.floor(elapsed / MS_PER_DAY),
      isPartial,
      ayahStart: Number.isFinite(ayahStart) ? ayahStart : 1,
      ayahEnd: ayahEnd > 0 ? ayahEnd : surah.versesCount,
      totalAyahsInSurah: surah.versesCount,
    });
  }
  // Oldest revision first
  tasks.sort((a, b) => (a.lastRevised ?? 0) - (b.lastRevised ?? 0));
  return tasks;
}

export function computeTodaysPlan(
  plan: HifdhPlan,
  planLessons: LessonDef[],
  progressLessons: Record<string, LessonProgress>,
  dueReviews: LessonReviewCard[],
  allSurahs: SurahMeta[],
  now = Date.now(),
): TodaysPlan {
  const date = todayIso();
  const isRest = !isStudyDay(date, plan.studyDays);

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  let newLessons: LessonDef[] = [];
  let completedNewLessonIds: string[] = [];
  let revisions: SurahRevisionTask[] = [];

  if (!isRest) {
    const next = getTodaysNewLessons(plan, planLessons, progressLessons, dayStart.getTime());
    newLessons = next.all;
    completedNewLessonIds = next.completedIds;
    revisions = getRevisionTasks(plan, planLessons, progressLessons, allSurahs, now);
  }

  const isComplete =
    dueReviews.length === 0 &&
    revisions.length === 0 &&
    newLessons.length > 0 &&
    completedNewLessonIds.length === newLessons.length;

  return {
    date,
    reviews: dueReviews,
    revisions,
    newLessons,
    isRestDay: isRest,
    isComplete,
    completedNewLessonIds,
  };
}

// ---------- Progress / pacing ----------

export function computePlanProgress(
  plan: HifdhPlan,
  planLessons: LessonDef[],
  progressLessons: Record<string, LessonProgress>,
  now = Date.now(),
): PlanProgress {
  const total = planLessons.length;
  const completed = planLessons.filter((l) => progressLessons[l.lessonId]?.completedAt).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const remaining = Math.max(0, total - completed);

  // Current pace: lessons completed in the last 7 days
  const sevenDaysAgo = now - 7 * MS_PER_DAY;
  const recentCompletions = planLessons.filter((l) => {
    const ts = progressLessons[l.lessonId]?.completedAt;
    return ts != null && ts >= sevenDaysAgo;
  }).length;
  const currentPace = recentCompletions / 7;

  const today = todayIso();
  let projectedFinishDate: string | null = null;
  let daysRemaining: number | null = null;
  let isOnTrack = true;
  let lessonsBehind = 0;

  if (plan.deadline) {
    daysRemaining = daysBetween(today, plan.deadline);
    const studyDaysLeft = countStudyDays(today, plan.deadline, plan.studyDays);
    const expectedCompleted = total - studyDaysLeft * plan.lessonsPerDay;
    lessonsBehind = Math.max(0, expectedCompleted - completed);
    isOnTrack = lessonsBehind === 0;
  }

  if (remaining === 0) {
    projectedFinishDate = today;
  } else {
    const effectivePace = plan.lessonsPerDay > 0 ? plan.lessonsPerDay : 1;
    // Project forward in study days
    let pending = remaining;
    const cursor = isoToDateUTC(today);
    const studyDaysSet = new Set(plan.studyDays);
    // Hard cap so a pathological config can't infinite-loop
    for (let i = 0; i < 20_000 && pending > 0; i++) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (studyDaysSet.has(cursor.getUTCDay())) pending -= effectivePace;
    }
    projectedFinishDate = dateUTCToIso(cursor);
  }

  return {
    totalLessons: total,
    completedLessons: completed,
    percentage,
    lessonsRemaining: remaining,
    projectedFinishDate,
    daysRemaining,
    isOnTrack,
    lessonsBehind,
    currentPace: Math.round(currentPace * 10) / 10,
  };
}

/**
 * Suggest a pace given a deadline. Returns null if deadline is in the past.
 * Pace is clamped to [1, 20]. `ambitious` flags above the typical hifdh ceiling
 * of 5/day, `impossible` flags above the 20/day sanity ceiling.
 */
export function suggestedPace(
  totalLessons: number,
  deadline: string,
  studyDays: number[],
  todayOverride?: string,
): { pace: number; ambitious: boolean; impossible: boolean } | null {
  const today = todayOverride ?? todayIso();
  if (daysBetween(today, deadline) < 0) return null;
  const studyDaysLeft = countStudyDays(today, deadline, studyDays);
  if (studyDaysLeft <= 0) {
    return { pace: 20, ambitious: true, impossible: true };
  }
  const raw = Math.ceil(totalLessons / studyDaysLeft);
  return {
    pace: Math.min(20, Math.max(1, raw)),
    ambitious: raw > 5,
    impossible: raw > 20,
  };
}
