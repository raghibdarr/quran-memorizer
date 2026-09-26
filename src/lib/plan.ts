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
import { todayIso, startOfTodayMs, daysBetween, isStudyDay, countStudyDays, addDaysIso, isoToDateUTC, dateUTCToIso, isoFromMs } from './dates';
import { buildReviewQueue, planManzil } from './retention';

// ---------- Date helpers ----------
// ALL day-boundary and calendar logic lives in src/lib/dates.ts (ONE local-time
// definition of "today"); re-exported here so existing importers keep working.
export { todayIso, startOfTodayMs, daysBetween, isStudyDay, countStudyDays, addDaysIso };

const MS_PER_DAY = 86_400_000;

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

  // The catch-up bonus belongs to the day being planned, not wall-clock today
  const bonus = plan.catchUpDate === isoFromMs(dayStartMs) ? (plan.catchUpBonus ?? 0) : 0;
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

/**
 * Stagger initial revision timestamps for known surahs so they don't all come
 * due on the same day (M4): surah i gets an offset of i % (frequency+1) days
 * back — roughly 1/frequency of them due immediately, the rest spread across
 * the window. Existing timestamps are never overwritten.
 */
export function staggeredLastRevised(
  surahIds: number[],
  frequencyDays: number,
  existing: Record<number, number> = {},
  now = Date.now(),
): Record<number, number> {
  const out: Record<number, number> = { ...existing };
  surahIds.forEach((id, i) => {
    if (out[id] == null) out[id] = now - (i % (frequencyDays + 1)) * MS_PER_DAY;
  });
  return out;
}

/**
 * Today's manzil revisions: every memorized surah — completed within the plan,
 * PLUS attested-known surahs when the plan tracks them (M4 "known = tracked") —
 * rotates through whole-surah recall once per revision cycle. The rotation
 * planner (src/lib/retention.ts, M5) caps and spreads the daily load, so a batch
 * of surahs finished together never floods one day (audit M15).
 */
export function getRevisionTasks(
  plan: HifdhPlan,
  planLessons: LessonDef[],
  progressLessons: Record<string, LessonProgress>,
  allSurahs: SurahMeta[],
  now: number,
): SurahRevisionTask[] {
  const completedSurahs = getCompletedPlanSurahs(plan, planLessons, progressLessons);
  const knownIds = plan.knownTracking ? plan.knownSurahIds : [];
  const candidateSurahs = Array.from(new Set([...completedSurahs, ...knownIds]));
  const byId = new Map(allSurahs.map((s) => [s.id, s]));
  const frequency = effectiveRevisionFrequency(plan, candidateSurahs.length);

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

  const candidates: Array<SurahRevisionTask & { lastTouched: number }> = [];
  for (const surahId of candidateSurahs) {
    const surah = byId.get(surahId);
    if (!surah) continue;
    const explicitLast = plan.lastRevisedAt[surahId];
    // Known-only surahs have no completion timestamp — fall back to plan creation
    // (marking known and plan setup both seed lastRevisedAt, so this is a net)
    const effectiveLast = explicitLast ?? surahCompletionTs.get(surahId) ?? plan.createdAt ?? now;

    // Known surahs carry no plan lessons — the revision scope is the whole surah
    const scope = surahLessons.get(surahId) ?? [];
    const ayahStart = scope.reduce((min, l) => Math.min(min, l.ayahStart), Infinity);
    const ayahEnd = scope.reduce((max, l) => Math.max(max, l.ayahEnd), 0);
    const scopedAyahCount = ayahEnd - ayahStart + 1;
    const isPartial = scope.length > 0 && scopedAyahCount < surah.versesCount;

    candidates.push({
      surahId,
      surahName: surah.nameSimple,
      lastRevised: explicitLast ?? null,
      daysSinceRevision: Math.floor((now - effectiveLast) / MS_PER_DAY),
      isPartial,
      ayahStart: Number.isFinite(ayahStart) ? ayahStart : 1,
      ayahEnd: ayahEnd > 0 ? ayahEnd : surah.versesCount,
      totalAyahsInSurah: surah.versesCount,
      lastTouched: effectiveLast,
    });
  }

  const rotation = planManzil(
    candidates.map((c) => ({ surahId: c.surahId, ayahCount: c.ayahEnd - c.ayahStart + 1, lastTouched: c.lastTouched })),
    { cycleDays: frequency, now, studyDays: plan.studyDays },
  );
  const byCandidate = new Map(candidates.map((c) => [c.surahId, c]));
  // The planner orders today's picks least-recently-touched first
  return rotation.today.map((id) => {
    const { lastTouched: _, ...task } = byCandidate.get(id)!;
    return task;
  });
}

export function computeTodaysPlan(
  plan: HifdhPlan,
  planLessons: LessonDef[],
  progressLessons: Record<string, LessonProgress>,
  lessonCards: LessonReviewCard[],
  allSurahs: SurahMeta[],
  now = Date.now(),
): TodaysPlan {
  // Review streams (M5): sabqi = recent lessons (incl. capped early touches),
  // manzil = older SM-2-due lessons. Reviews run on rest days too — only NEW
  // work and surah rotation pause.
  const queue = buildReviewQueue(lessonCards, progressLessons, now);
  const dueReviews = [...queue.sabqi, ...queue.manzil];
  // Derived from `now`, so the same function can preview tomorrow (M6 day-complete)
  const date = isoFromMs(now);
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

  // "Nothing left today" — a maintain plan (no new lessons) can complete too
  const isComplete =
    dueReviews.length === 0 &&
    revisions.length === 0 &&
    completedNewLessonIds.length === newLessons.length;

  return {
    date,
    reviews: dueReviews,
    sabqi: queue.sabqi,
    manzil: queue.manzil,
    earlyReviewIds: [...queue.earlyIds],
    overdueReviewCount: queue.overdueCount,
    revisions,
    newLessons,
    isRestDay: isRest,
    isComplete,
    completedNewLessonIds,
  };
}

// ---------- Progress / pacing ----------

/**
 * Ayah-weighted progress toward the plan's GOAL (M6, audit M19): memorized ayahs
 * in scope ÷ ayahs in scope. Ayah-weighting keeps a 5-ayah lesson from counting
 * like a 20-ayah one; attested-known surahs and lessons count as memorized. This
 * is the headline number — whole-Quran coverage is only a secondary stat.
 */
export function computeGoalAyahProgress(
  plan: HifdhPlan,
  allSurahs: SurahMeta[],
  juzIndex: JuzMeta[],
  progressLessons: Record<string, LessonProgress>,
): { memorized: number; total: number; percentage: number } {
  const scope = getPlanLessons({ ...plan, knownSurahIds: [], knownLessonIds: [] }, allSurahs, juzIndex);
  const knownSurahs = new Set(plan.knownSurahIds);
  const knownLessons = new Set(plan.knownLessonIds ?? []);
  let memorized = 0;
  let total = 0;
  for (const l of scope) {
    total += l.ayahCount;
    if (knownSurahs.has(l.surahId) || knownLessons.has(l.lessonId) || progressLessons[l.lessonId]?.completedAt) {
      memorized += l.ayahCount;
    }
  }
  // Floor, never round up: 99.6% must not claim a finished goal
  const percentage = total > 0 ? Math.floor((memorized / total) * 100) : 0;
  return { memorized, total, percentage };
}

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

  const today = isoFromMs(now);
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
  } else {
    // Deadline-free plans (the default) get a pace nudge too (M6, audit m5).
    // Expected = lessons already done when the plan began + the chosen pace on
    // every study day from the day AFTER creation through YESTERDAY — the
    // creation day and today are never held against the user.
    const firstCountedDay = addDaysIso(isoFromMs(plan.createdAt), 1);
    const yesterday = addDaysIso(today, -1);
    const studyDaysElapsed = daysBetween(firstCountedDay, yesterday) >= 0
      ? countStudyDays(firstCountedDay, yesterday, plan.studyDays)
      : 0;
    const doneAtStart = planLessons.filter(
      (l) => (progressLessons[l.lessonId]?.completedAt ?? Infinity) < plan.createdAt,
    ).length;
    const expectedCompleted = Math.min(total, doneAtStart + studyDaysElapsed * plan.lessonsPerDay);
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
