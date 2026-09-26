import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HifdhPlan, JuzMeta, LessonDef, LessonProgress, LessonReviewCard, SurahMeta } from '@/types/quran';
import {
  addDaysIso,
  autoRevisionFrequencyDays,
  computePlanProgress,
  countStudyDays,
  daysBetween,
  effectiveRevisionFrequency,
  getCompletedPlanSurahs,
  getPlanLessons,
  getRevisionTasks,
  computeGoalAyahProgress,
  computeTodaysPlan,
  getTodaysNewLessons,
  isStudyDay,
  resolveGoalSurahIds,
  staggeredLastRevised,
  suggestedPace,
  todayIso,
} from './plan';
import { createSeededCard } from './spaced-repetition';
import { qualityToHealth } from './review-helpers';
import { startOfDayMs } from './dates';

const NOW = new Date('2026-05-25T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------- Test fixtures ----------

const surah = (id: number, versesCount: number, name = `Surah${id}`): SurahMeta => ({
  id,
  nameSimple: name,
  nameArabic: `سورة ${id}`,
  nameTranslation: name,
  revelationPlace: 'makkah',
  versesCount,
});

// Tiny synthetic juz index for tests — juz 1 has surahs 1+2, juz 30 has surahs 78+114
const TEST_JUZ_INDEX: JuzMeta[] = [
  { juzNumber: 1, verseMappings: [
    { surahId: 1, ayahStart: 1, ayahEnd: 7 },
    { surahId: 2, ayahStart: 1, ayahEnd: 50 },
  ]},
  { juzNumber: 2, verseMappings: [
    { surahId: 2, ayahStart: 51, ayahEnd: 100 },
  ]},
  { juzNumber: 30, verseMappings: [
    { surahId: 78, ayahStart: 1, ayahEnd: 40 },
    { surahId: 114, ayahStart: 1, ayahEnd: 6 },
  ]},
];

const TEST_SURAHS: SurahMeta[] = [
  surah(1, 7, 'Al-Fatiha'),
  surah(2, 100, 'Al-Baqarah'),
  surah(78, 40, 'An-Naba'),
  surah(114, 6, 'An-Nas'),
];

function makePlan(overrides: Partial<HifdhPlan> = {}): HifdhPlan {
  return {
    id: 'test-plan',
    createdAt: NOW,
    goalType: 'full-quran',
    goalSurahIds: [1, 2, 78, 114],
    goalJuzNumbers: [],
    deadline: null,
    knownSurahIds: [],
    knownLessonIds: [],
    lessonsPerDay: 1,
    studyDays: [0, 1, 2, 3, 4, 5, 6],
    completedLessonIds: [],
    revisionFrequencyDays: 7,
    revisionFrequencyAuto: false,
    lastRevisedAt: {},
    catchUpDate: null,
    catchUpBonus: 0,
    finishCelebrated: false,
    ...overrides,
  };
}

// ---------- Date helpers ----------

describe('todayIso', () => {
  it('returns ISO date for current system time', () => {
    expect(todayIso()).toBe('2026-05-25');
  });
});

describe('daysBetween', () => {
  it('counts forward days', () => {
    expect(daysBetween('2026-05-25', '2026-06-01')).toBe(7);
  });
  it('returns 0 for same day', () => {
    expect(daysBetween('2026-05-25', '2026-05-25')).toBe(0);
  });
  it('returns negative when target is in the past', () => {
    expect(daysBetween('2026-05-25', '2026-05-20')).toBe(-5);
  });
});

describe('addDaysIso', () => {
  it('adds days and wraps months', () => {
    expect(addDaysIso('2026-05-25', 10)).toBe('2026-06-04');
  });
  it('handles year boundary', () => {
    expect(addDaysIso('2026-12-25', 10)).toBe('2027-01-04');
  });
});

describe('isStudyDay', () => {
  it('matches day-of-week against the studyDays set', () => {
    // 2026-05-25 is a Monday (dow=1)
    expect(isStudyDay('2026-05-25', [1, 3, 5])).toBe(true);
    expect(isStudyDay('2026-05-25', [0, 2, 4, 6])).toBe(false);
  });
});

describe('countStudyDays', () => {
  it('counts inclusive day range with all days as study days', () => {
    expect(countStudyDays('2026-05-25', '2026-05-31', [0, 1, 2, 3, 4, 5, 6])).toBe(7);
  });
  it('counts only weekdays when only weekdays selected', () => {
    // Mon 2026-05-25 through Sun 2026-05-31 inclusive => 5 weekdays
    expect(countStudyDays('2026-05-25', '2026-05-31', [1, 2, 3, 4, 5])).toBe(5);
  });
  it('returns 0 when toIso is before fromIso', () => {
    expect(countStudyDays('2026-05-25', '2026-05-20', [0, 1, 2, 3, 4, 5, 6])).toBe(0);
  });
});

// ---------- Goal resolution ----------

describe('resolveGoalSurahIds', () => {
  it('full-quran returns all 114 surahs', () => {
    const ids = resolveGoalSurahIds('full-quran', {}, TEST_JUZ_INDEX);
    expect(ids).toHaveLength(114);
  });

  it('juz goal returns surahs from selected juz', () => {
    const ids = resolveGoalSurahIds('juz', { juzNumbers: [30] }, TEST_JUZ_INDEX);
    expect(ids).toContain(78);
    expect(ids).toContain(114);
    expect(ids).not.toContain(1);
  });

  it('multiple juz unions their surahs', () => {
    const ids = resolveGoalSurahIds('juz', { juzNumbers: [1, 30] }, TEST_JUZ_INDEX);
    expect(ids).toEqual(expect.arrayContaining([1, 2, 78, 114]));
  });

  it('surah goal returns the provided list, ordered by curriculum', () => {
    const ids = resolveGoalSurahIds('surah', { surahIds: [78, 1, 114] }, TEST_JUZ_INDEX);
    // 1 is first in CURRICULUM_ORDER
    expect(ids[0]).toBe(1);
  });

  it('deduplicates if a juz selection repeats surahs', () => {
    const ids = resolveGoalSurahIds('juz', { juzNumbers: [1, 2] }, TEST_JUZ_INDEX);
    // Surah 2 appears in both juz 1 and juz 2 — should only appear once
    expect(ids.filter((id) => id === 2)).toHaveLength(1);
  });
});

// ---------- Plan lessons ----------

describe('getPlanLessons', () => {
  it('includes lessons for every goal surah by default', () => {
    const plan = makePlan({ goalSurahIds: [114] });
    const lessons = getPlanLessons(plan, TEST_SURAHS, TEST_JUZ_INDEX);
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((l) => l.surahId === 114)).toBe(true);
  });

  it('excludes knownSurahIds entirely', () => {
    const plan = makePlan({ goalSurahIds: [1, 114], knownSurahIds: [1] });
    const lessons = getPlanLessons(plan, TEST_SURAHS, TEST_JUZ_INDEX);
    expect(lessons.every((l) => l.surahId !== 1)).toBe(true);
    expect(lessons.some((l) => l.surahId === 114)).toBe(true);
  });

  it('filters by juz for juz-scoped plans', () => {
    // Plan covers surah 2 but only juz 1 portion
    const plan = makePlan({
      goalType: 'juz',
      goalSurahIds: [2],
      goalJuzNumbers: [1],
    });
    const lessons = getPlanLessons(plan, TEST_SURAHS, TEST_JUZ_INDEX);
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((l) => l.juzNumber === 1)).toBe(true);
    // No lesson should extend past ayah 50 (juz 1 boundary for surah 2)
    expect(lessons.every((l) => l.ayahEnd <= 50)).toBe(true);
  });

  it('excludes knownLessonIds when set', () => {
    const plan = makePlan({ goalSurahIds: [78] }); // An-Naba 40 ayahs
    const allLessons = getPlanLessons(plan, TEST_SURAHS, TEST_JUZ_INDEX);
    const someLessonId = allLessons[0].lessonId;
    const planWithKnown = makePlan({ goalSurahIds: [78], knownLessonIds: [someLessonId] });
    const filtered = getPlanLessons(planWithKnown, TEST_SURAHS, TEST_JUZ_INDEX);
    expect(filtered.find((l) => l.lessonId === someLessonId)).toBeUndefined();
    expect(filtered.length).toBe(allLessons.length - 1);
  });
});

// ---------- Today's new lessons ----------

describe('getTodaysNewLessons', () => {
  const planLessons: LessonDef[] = [
    { lessonId: 'L1', surahId: 1, lessonNumber: 1, ayahStart: 1, ayahEnd: 3, ayahCount: 3, juzNumber: 1 },
    { lessonId: 'L2', surahId: 1, lessonNumber: 2, ayahStart: 4, ayahEnd: 7, ayahCount: 4, juzNumber: 1 },
    { lessonId: 'L3', surahId: 2, lessonNumber: 1, ayahStart: 1, ayahEnd: 5, ayahCount: 5, juzNumber: 1 },
    { lessonId: 'L4', surahId: 2, lessonNumber: 2, ayahStart: 6, ayahEnd: 10, ayahCount: 5, juzNumber: 1 },
  ];

  it('returns first N incomplete lessons when nothing is done', () => {
    const plan = makePlan({ lessonsPerDay: 2 });
    const result = getTodaysNewLessons(plan, planLessons, {}, NOW - 1_000_000);
    expect(result.all.map((l) => l.lessonId)).toEqual(['L1', 'L2']);
    expect(result.completedIds).toEqual([]);
  });

  it('keeps completed-today lessons visible and tops up to pace', () => {
    const plan = makePlan({ lessonsPerDay: 2 });
    const dayStart = NOW - 1000;
    const progress: Record<string, LessonProgress> = {
      L1: { lessonId: 'L1', surahId: 1, currentPhase: 'complete', phaseData: {} as any, startedAt: 0, completedAt: NOW - 500 },
    };
    const result = getTodaysNewLessons(plan, planLessons, progress, dayStart);
    // L1 was completed today -> stays; +1 next incomplete to fill pace of 2
    expect(result.all.map((l) => l.lessonId)).toEqual(['L1', 'L2']);
    expect(result.completedIds).toEqual(['L1']);
  });

  it('ignores lessons completed before today when topping up', () => {
    const plan = makePlan({ lessonsPerDay: 2 });
    const dayStart = NOW - 1000;
    const progress: Record<string, LessonProgress> = {
      L1: { lessonId: 'L1', surahId: 1, currentPhase: 'complete', phaseData: {} as any, startedAt: 0, completedAt: dayStart - 999_000 },
    };
    const result = getTodaysNewLessons(plan, planLessons, progress, dayStart);
    // L1 done yesterday -> not in the visible "today" list, only the next incomplete two
    expect(result.all.map((l) => l.lessonId)).toEqual(['L2', 'L3']);
  });

  it('adds catch-up bonus to today\'s pace when catchUpDate matches today', () => {
    const plan = makePlan({
      lessonsPerDay: 1,
      catchUpDate: todayIso(),
      catchUpBonus: 2,
    });
    const result = getTodaysNewLessons(plan, planLessons, {}, NOW - 1_000_000);
    expect(result.all.map((l) => l.lessonId)).toEqual(['L1', 'L2', 'L3']);
  });

  it('ignores catch-up bonus on a different day', () => {
    const plan = makePlan({
      lessonsPerDay: 1,
      catchUpDate: '2020-01-01',
      catchUpBonus: 5,
    });
    const result = getTodaysNewLessons(plan, planLessons, {}, NOW - 1_000_000);
    expect(result.all).toHaveLength(1);
  });
});

// ---------- Completed-in-plan ----------

describe('getCompletedPlanSurahs', () => {
  it('marks a surah complete only when all its plan lessons are done', () => {
    const planLessons: LessonDef[] = [
      { lessonId: '1-1', surahId: 1, lessonNumber: 1, ayahStart: 1, ayahEnd: 3, ayahCount: 3, juzNumber: 1 },
      { lessonId: '1-2', surahId: 1, lessonNumber: 2, ayahStart: 4, ayahEnd: 7, ayahCount: 4, juzNumber: 1 },
    ];
    const partial: Record<string, LessonProgress> = {
      '1-1': { lessonId: '1-1', surahId: 1, currentPhase: 'complete', phaseData: {} as any, startedAt: 0, completedAt: NOW },
    };
    expect(getCompletedPlanSurahs(makePlan(), planLessons, partial)).toEqual([]);

    const all: Record<string, LessonProgress> = {
      ...partial,
      '1-2': { lessonId: '1-2', surahId: 1, currentPhase: 'complete', phaseData: {} as any, startedAt: 0, completedAt: NOW },
    };
    expect(getCompletedPlanSurahs(makePlan(), planLessons, all)).toEqual([1]);
  });
});

// ---------- Revision tasks ----------

describe('getRevisionTasks', () => {
  const oneLessonPlanLessons: LessonDef[] = [
    { lessonId: '114-1', surahId: 114, lessonNumber: 1, ayahStart: 1, ayahEnd: 6, ayahCount: 6, juzNumber: 30 },
  ];
  const completedProgress: Record<string, LessonProgress> = {
    '114-1': { lessonId: '114-1', surahId: 114, currentPhase: 'complete', phaseData: {} as any, startedAt: 0, completedAt: NOW - 10 * 86_400_000 },
  };

  it('returns no tasks before the revision frequency has elapsed', () => {
    const plan = makePlan({ revisionFrequencyDays: 30 });
    const tasks = getRevisionTasks(plan, oneLessonPlanLessons, completedProgress, TEST_SURAHS, NOW);
    expect(tasks).toEqual([]);
  });

  it('returns a task once elapsed time exceeds the frequency', () => {
    const plan = makePlan({ revisionFrequencyDays: 7 });
    const tasks = getRevisionTasks(plan, oneLessonPlanLessons, completedProgress, TEST_SURAHS, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].surahId).toBe(114);
    expect(tasks[0].isPartial).toBe(false); // covers all 6 ayahs
  });

  it('marks isPartial=true for juz-scoped plans that don\'t cover the whole surah', () => {
    // Surah 2 has 100 ayahs; plan only covers juz 1 portion (ayahs 1-50)
    const juzLessons: LessonDef[] = [
      { lessonId: '2-1', surahId: 2, lessonNumber: 1, ayahStart: 1, ayahEnd: 25, ayahCount: 25, juzNumber: 1 },
      { lessonId: '2-2', surahId: 2, lessonNumber: 2, ayahStart: 26, ayahEnd: 50, ayahCount: 25, juzNumber: 1 },
    ];
    const progress: Record<string, LessonProgress> = {
      '2-1': { lessonId: '2-1', surahId: 2, currentPhase: 'complete', phaseData: {} as any, startedAt: 0, completedAt: NOW - 10 * 86_400_000 },
      '2-2': { lessonId: '2-2', surahId: 2, currentPhase: 'complete', phaseData: {} as any, startedAt: 0, completedAt: NOW - 10 * 86_400_000 },
    };
    const plan = makePlan({ goalType: 'juz', goalJuzNumbers: [1], goalSurahIds: [2], revisionFrequencyDays: 7 });
    const tasks = getRevisionTasks(plan, juzLessons, progress, TEST_SURAHS, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].isPartial).toBe(true);
    expect(tasks[0].ayahStart).toBe(1);
    expect(tasks[0].ayahEnd).toBe(50);
    expect(tasks[0].totalAyahsInSurah).toBe(100);
  });

  it('uses lastRevisedAt as the cycle start when set', () => {
    const plan = makePlan({
      revisionFrequencyDays: 7,
      lastRevisedAt: { 114: NOW - 1 * 86_400_000 }, // revised 1 day ago
    });
    const tasks = getRevisionTasks(plan, oneLessonPlanLessons, completedProgress, TEST_SURAHS, NOW);
    expect(tasks).toEqual([]); // not yet due again
  });
});

// ---------- M4: known = tracked ----------

describe('known-surah revision eligibility (M4)', () => {
  it('ACCEPTANCE: all of a juz known → zero new lessons, populated revision schedule', () => {
    const plan = makePlan({
      goalType: 'juz',
      goalJuzNumbers: [30],
      goalSurahIds: [78, 114],
      knownSurahIds: [78, 114],
      knownTracking: true,
      revisionFrequencyDays: 7,
      lastRevisedAt: { 78: NOW - 8 * 86_400_000, 114: NOW - 2 * 86_400_000 },
    });
    expect(getPlanLessons(plan, TEST_SURAHS, TEST_JUZ_INDEX)).toEqual([]);

    const tasks = getRevisionTasks(plan, [], {}, TEST_SURAHS, NOW);
    expect(tasks).toHaveLength(1); // 78 overdue, 114 revised recently
    expect(tasks[0].surahId).toBe(78);
    // Known surahs have no plan lessons — the whole surah is the revision scope
    expect(tasks[0].isPartial).toBe(false);
    expect(tasks[0].ayahStart).toBe(1);
    expect(tasks[0].ayahEnd).toBe(40);
  });

  it('legacy plans (knownTracking undefined) keep the old known-means-hidden behavior', () => {
    const plan = makePlan({
      knownSurahIds: [78],
      knownTracking: undefined,
      lastRevisedAt: { 78: NOW - 30 * 86_400_000 },
    });
    expect(getRevisionTasks(plan, [], {}, TEST_SURAHS, NOW)).toEqual([]);
  });

  it('known surahs without lastRevisedAt fall back to plan creation for the timer', () => {
    const plan = makePlan({
      createdAt: NOW - 10 * 86_400_000,
      knownSurahIds: [114],
      knownTracking: true,
      revisionFrequencyDays: 7,
    });
    const tasks = getRevisionTasks(plan, [], {}, TEST_SURAHS, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].surahId).toBe(114);
  });

  it('ACCEPTANCE: toggling known off restores lesson availability', () => {
    const known = makePlan({ goalType: 'juz', goalJuzNumbers: [30], goalSurahIds: [78, 114], knownSurahIds: [78] });
    const unknown = { ...known, knownSurahIds: [] };
    const withKnown = getPlanLessons(known, TEST_SURAHS, TEST_JUZ_INDEX);
    const without = getPlanLessons(unknown, TEST_SURAHS, TEST_JUZ_INDEX);
    expect(withKnown.some((l) => l.surahId === 78)).toBe(false);
    expect(without.some((l) => l.surahId === 78)).toBe(true);
    // Seeded review-card ratings live in the review store — untouched by the toggle
  });

  it('revision frequency auto-tier counts known surahs too', () => {
    const plan = makePlan({
      goalType: 'maintain',
      goalSurahIds: Array.from({ length: 20 }, (_, i) => i + 1),
      knownSurahIds: Array.from({ length: 20 }, (_, i) => i + 1),
      knownTracking: true,
      revisionFrequencyAuto: true,
    });
    // 20 known surahs → 14-day tier (not the 3-day beginner tier)
    const surahs = plan.goalSurahIds.map((sid) => surah(sid, 10));
    const tasks = getRevisionTasks(plan, [], {}, surahs, NOW);
    // With lastRevisedAt empty and createdAt=NOW nothing is due — the point is no crash
    // and the tier math; pin it via effectiveRevisionFrequency directly:
    expect(effectiveRevisionFrequency(plan, 20)).toBe(14);
    expect(tasks).toEqual([]);
  });
});

describe('staggeredLastRevised (M4)', () => {
  it('spreads offsets across the window so a fraction is due immediately', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i + 1);
    const stamps = staggeredLastRevised(ids, 7, {}, NOW);
    const offsets = ids.map((id) => (NOW - stamps[id]) / 86_400_000);
    expect(Math.min(...offsets)).toBe(0);
    expect(Math.max(...offsets)).toBe(7); // offset === frequency → due today
    expect(offsets.filter((o) => o >= 7)).toHaveLength(2); // 16 ids over 0..7 cycle
  });

  it('never overwrites an existing revision timestamp', () => {
    const existing = { 5: 12345 };
    expect(staggeredLastRevised([5, 6], 7, existing, NOW)[5]).toBe(12345);
  });
});

describe('createSeededCard (M4)', () => {
  it('ACCEPTANCE: seeded cards read as shaky — never strong, never absent', () => {
    const card = createSeededCard(78, 1, 0);
    expect(qualityToHealth(card.lastQuality)).toBe('shaky');
    expect(card.repetitions).toBe(1);
    expect(card.lastReview).toBe(0); // a real review always outranks it in sync merges
  });

  it('staggers due dates over a week of local midnights', () => {
    const days = Array.from({ length: 14 }, (_, i) => createSeededCard(78, i + 1, i).nextReview);
    const unique = new Set(days);
    expect(unique.size).toBe(7); // 14 ayahs cycle through 7 distinct due days
    for (const d of unique) {
      expect(d).toBe(startOfDayMs(d)); // each is a local midnight
      expect(d).toBeGreaterThan(NOW); // none dumped into today's queue
    }
  });
});

describe('maintain goal type (M4)', () => {
  it('resolves scope from surahIds and yields zero lessons when all are known', () => {
    const ids = resolveGoalSurahIds('maintain', { surahIds: [114, 78] }, TEST_JUZ_INDEX);
    expect(ids).toEqual(expect.arrayContaining([78, 114]));
    const plan = makePlan({
      goalType: 'maintain',
      goalSurahIds: ids,
      knownSurahIds: ids,
      knownTracking: true,
    });
    expect(getPlanLessons(plan, TEST_SURAHS, TEST_JUZ_INDEX)).toEqual([]);
  });
});

// ---------- Revision frequency auto ----------

describe('computeTodaysPlan — three streams (M5)', () => {
  const DAY = 86_400_000;
  const lessonCard = (id: string, o: Partial<LessonReviewCard> = {}): LessonReviewCard => {
    const [s, l] = id.split('-').map(Number);
    return {
      lessonId: id, surahId: s, lessonNumber: l, ayahStart: 1, ayahEnd: 6,
      easeFactor: 2.5, interval: 7, repetitions: 3, nextReview: NOW - DAY,
      lastReview: NOW - 8 * DAY, lastQuality: 4, ...o,
    };
  };
  const complete = (id: string, daysAgo: number): LessonProgress => ({
    lessonId: id, surahId: Number(id.split('-')[0]), currentPhase: 'complete',
    phaseData: {} as LessonProgress['phaseData'], startedAt: 0, completedAt: NOW - daysAgo * DAY,
  });

  it('splits due lesson reviews into sabqi (recent) and manzil (older); reviews = both', () => {
    const cards = [lessonCard('114-1'), lessonCard('78-1')];
    const progress = { '114-1': complete('114-1', 3), '78-1': complete('78-1', 90) };
    const today = computeTodaysPlan(makePlan(), [], progress, cards, TEST_SURAHS, NOW);
    expect(today.sabqi.map((c) => c.lessonId)).toEqual(['114-1']);
    expect(today.manzil.map((c) => c.lessonId)).toEqual(['78-1']);
    expect(today.reviews).toHaveLength(2);
    expect(today.overdueReviewCount).toBe(2);
  });

  it('a maintain plan with nothing due counts as complete (no new-lesson requirement)', () => {
    const plan = makePlan({ goalType: 'maintain', goalSurahIds: [114], knownSurahIds: [114], knownTracking: true, lastRevisedAt: { 114: NOW - 1000 } });
    const today = computeTodaysPlan(plan, [], {}, [], TEST_SURAHS, NOW);
    expect(today.newLessons).toEqual([]);
    expect(today.revisions).toEqual([]);
    expect(today.isComplete).toBe(true);
  });

  it('reviews still show on a rest day; surah rotation and new lessons pause', () => {
    // Day 9 never occurs, so every day is a rest day
    const plan = makePlan({ studyDays: [9], knownSurahIds: [78], knownTracking: true, lastRevisedAt: { 78: NOW - 30 * DAY } });
    const today = computeTodaysPlan(plan, [], { '114-1': complete('114-1', 3) }, [lessonCard('114-1')], TEST_SURAHS, NOW);
    expect(today.isRestDay).toBe(true);
    expect(today.sabqi).toHaveLength(1);
    expect(today.revisions).toEqual([]);
  });
});

describe('deadline-free pace nudge (M6)', () => {
  const DAY = 86_400_000;
  const lessonsFor = (n: number): LessonDef[] =>
    Array.from({ length: n }, (_, i) => ({ lessonId: `2-${i + 1}`, surahId: 2, lessonNumber: i + 1, ayahStart: i + 1, ayahEnd: i + 1, ayahCount: 1, juzNumber: 1 }));
  const doneAt = (id: string, ts: number): LessonProgress =>
    ({ lessonId: id, surahId: 2, currentPhase: 'complete', phaseData: {} as LessonProgress['phaseData'], startedAt: 0, completedAt: ts });

  it('a plan created today or yesterday is never behind (creation day and today are free)', () => {
    expect(computePlanProgress(makePlan({ createdAt: NOW }), lessonsFor(20), {}).lessonsBehind).toBe(0);
    expect(computePlanProgress(makePlan({ createdAt: NOW - DAY }), lessonsFor(20), {}).lessonsBehind).toBe(0);
  });

  it('counts study days after creation through yesterday at the chosen pace', () => {
    // created 5 days ago → 4 counted days (creation+1 … yesterday), 1/day, 1 done
    const plan = makePlan({ createdAt: NOW - 5 * DAY, lessonsPerDay: 1 });
    const progress = { '2-1': doneAt('2-1', NOW - 2 * DAY) };
    const r = computePlanProgress(plan, lessonsFor(20), progress);
    expect(r.lessonsBehind).toBe(3);
    expect(r.isOnTrack).toBe(false);
  });

  it('lessons finished before the plan existed are not credited as pace', () => {
    const plan = makePlan({ createdAt: NOW - 3 * DAY, lessonsPerDay: 1 });
    const progress = { '2-1': doneAt('2-1', NOW - 30 * DAY), '2-2': doneAt('2-2', NOW - 30 * DAY) };
    // expected = 2 (already done) + 2 days × 1 = 4; completed = 2
    expect(computePlanProgress(plan, lessonsFor(20), progress).lessonsBehind).toBe(2);
  });

  it('rest days carry no expectation', () => {
    const plan = makePlan({ createdAt: NOW - 5 * DAY, lessonsPerDay: 1, studyDays: [9] });
    expect(computePlanProgress(plan, lessonsFor(20), {}).lessonsBehind).toBe(0);
  });
});

describe('computeGoalAyahProgress (M6)', () => {
  const juzPlan = () => makePlan({ goalType: 'juz', goalJuzNumbers: [30], goalSurahIds: [78, 114] });

  it('ACCEPTANCE: a day-1 Juz-30 user sees a meaningful nonzero percentage', () => {
    const lessons = getPlanLessons(juzPlan(), TEST_SURAHS, TEST_JUZ_INDEX);
    const nas = lessons.find((l) => l.surahId === 114)!;
    const progress = { [nas.lessonId]: { lessonId: nas.lessonId, surahId: 114, currentPhase: 'complete', phaseData: {} as LessonProgress['phaseData'], startedAt: 0, completedAt: NOW } as LessonProgress };
    const p = computeGoalAyahProgress(juzPlan(), TEST_SURAHS, TEST_JUZ_INDEX, progress);
    expect(p.total).toBe(46); // 40 (An-Naba) + 6 (An-Nas)
    expect(p.memorized).toBe(6);
    expect(p.percentage).toBe(13);
  });

  it('known surahs count as memorized; 99.x% never rounds up to 100', () => {
    const p = computeGoalAyahProgress({ ...juzPlan(), knownSurahIds: [78] }, TEST_SURAHS, TEST_JUZ_INDEX, {});
    expect(p.memorized).toBe(40);
    expect(p.percentage).toBe(86); // 40/46 = 86.9 → 86
  });
});

describe('autoRevisionFrequencyDays', () => {
  it('intensive for early progress', () => {
    expect(autoRevisionFrequencyDays(0)).toBe(3);
    expect(autoRevisionFrequencyDays(5)).toBe(3);
  });
  it('weekly for mid progress', () => {
    expect(autoRevisionFrequencyDays(6)).toBe(7);
    expect(autoRevisionFrequencyDays(15)).toBe(7);
  });
  it('light for advanced', () => {
    expect(autoRevisionFrequencyDays(16)).toBe(14);
    expect(autoRevisionFrequencyDays(100)).toBe(14);
  });
});

describe('effectiveRevisionFrequency', () => {
  it('returns stored value when auto is off', () => {
    const plan = makePlan({ revisionFrequencyDays: 5, revisionFrequencyAuto: false });
    expect(effectiveRevisionFrequency(plan, 20)).toBe(5);
  });
  it('derives from completed count when auto is on', () => {
    const plan = makePlan({ revisionFrequencyDays: 5, revisionFrequencyAuto: true });
    expect(effectiveRevisionFrequency(plan, 20)).toBe(14);
  });
});

// ---------- Progress ----------

describe('computePlanProgress', () => {
  const planLessons: LessonDef[] = [
    { lessonId: 'L1', surahId: 1, lessonNumber: 1, ayahStart: 1, ayahEnd: 3, ayahCount: 3, juzNumber: 1 },
    { lessonId: 'L2', surahId: 1, lessonNumber: 2, ayahStart: 4, ayahEnd: 7, ayahCount: 4, juzNumber: 1 },
    { lessonId: 'L3', surahId: 2, lessonNumber: 1, ayahStart: 1, ayahEnd: 5, ayahCount: 5, juzNumber: 1 },
    { lessonId: 'L4', surahId: 2, lessonNumber: 2, ayahStart: 6, ayahEnd: 10, ayahCount: 5, juzNumber: 1 },
  ];

  it('computes percentage from completed/total', () => {
    const progress: Record<string, LessonProgress> = {
      L1: { lessonId: 'L1', surahId: 1, currentPhase: 'complete', phaseData: {} as any, startedAt: 0, completedAt: NOW },
      L2: { lessonId: 'L2', surahId: 1, currentPhase: 'complete', phaseData: {} as any, startedAt: 0, completedAt: NOW },
    };
    const result = computePlanProgress(makePlan(), planLessons, progress);
    expect(result.completedLessons).toBe(2);
    expect(result.totalLessons).toBe(4);
    expect(result.percentage).toBe(50);
    expect(result.lessonsRemaining).toBe(2);
  });

  it('isOnTrack=true with no deadline', () => {
    const result = computePlanProgress(makePlan({ deadline: null }), planLessons, {});
    expect(result.isOnTrack).toBe(true);
    expect(result.lessonsBehind).toBe(0);
  });

  it('flags behind-schedule when deadline is tight', () => {
    // Deadline tomorrow, 4 lessons, 1/day pace -> behind
    const plan = makePlan({
      deadline: addDaysIso(todayIso(), 1),
      lessonsPerDay: 1,
    });
    const result = computePlanProgress(plan, planLessons, {});
    expect(result.isOnTrack).toBe(false);
    expect(result.lessonsBehind).toBeGreaterThan(0);
  });
});

// ---------- suggestedPace ----------

describe('suggestedPace', () => {
  it('returns null when deadline is in the past', () => {
    expect(suggestedPace(10, '2020-01-01', [0, 1, 2, 3, 4, 5, 6])).toBeNull();
  });

  it('computes ceil(lessons / studyDaysLeft) for normal cases', () => {
    // 10 lessons, deadline 10 days from now, every day study -> 1/day
    const result = suggestedPace(10, addDaysIso(todayIso(), 10), [0, 1, 2, 3, 4, 5, 6]);
    expect(result?.pace).toBe(1);
    expect(result?.ambitious).toBe(false);
    expect(result?.impossible).toBe(false);
  });

  it('flags ambitious above 5/day', () => {
    // 30 lessons, deadline +4 days -> 5 inclusive study days -> 6/day
    const result = suggestedPace(30, addDaysIso(todayIso(), 4), [0, 1, 2, 3, 4, 5, 6]);
    expect(result?.ambitious).toBe(true);
    expect(result?.impossible).toBe(false);
    expect(result?.pace).toBe(6);
  });

  it('flags impossible above 20/day and clamps pace', () => {
    // 100 lessons, deadline +1 -> 2 inclusive study days -> 50/day
    const result = suggestedPace(100, addDaysIso(todayIso(), 1), [0, 1, 2, 3, 4, 5, 6]);
    expect(result?.impossible).toBe(true);
    expect(result?.pace).toBe(20);
  });

  it('handles study-day-only schedules', () => {
    // 5 lessons, deadline next Monday (7 calendar days), study only on weekdays
    // From Mon -> next Mon: 6 study days; 5 lessons => 1/day
    const result = suggestedPace(5, addDaysIso(todayIso(), 7), [1, 2, 3, 4, 5]);
    expect(result?.pace).toBe(1);
  });
});
