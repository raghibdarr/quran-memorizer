import { describe, expect, it } from 'vitest';
import type { HifdhPlan, JuzMeta, LessonProgress, LessonReviewCard, SurahMeta } from '@/types/quran';
import { planReminders, COMEBACK_DAY, DAILY_REMINDER_DAYS, REMINDER_ID_BASE, type ReminderState } from './reminders';
import { getPlanLessons } from './plan';

// Local times, so "19:00 today" means the same thing on any test machine
const NOW = new Date(2026, 4, 25, 12, 0).getTime(); // Mon 25 May 2026, 12:00
const at = (dayOffset: number, hour: number, minute = 0) => new Date(2026, 4, 25 + dayOffset, hour, minute).getTime();
const DAY = 86_400_000;

const SURAHS: SurahMeta[] = [
  { id: 1, nameSimple: 'Al-Fatiha', nameArabic: '', nameTranslation: '', revelationPlace: 'makkah', versesCount: 7 },
  { id: 78, nameSimple: 'An-Naba', nameArabic: '', nameTranslation: '', revelationPlace: 'makkah', versesCount: 40 },
];
const JUZ: JuzMeta[] = [
  { juzNumber: 1, verseMappings: [{ surahId: 1, ayahStart: 1, ayahEnd: 7 }] },
  { juzNumber: 30, verseMappings: [{ surahId: 78, ayahStart: 1, ayahEnd: 40 }] },
];

const card = (lessonId: string, nextReview: number, repetitions = 5): LessonReviewCard => ({
  lessonId,
  surahId: Number(lessonId.split('-')[0]),
  lessonNumber: Number(lessonId.split('-')[1]),
  ayahStart: 1,
  ayahEnd: 5,
  easeFactor: 2.5,
  interval: 10,
  repetitions,
  nextReview,
  lastReview: NOW - 10 * DAY,
  lastQuality: 4,
});

function state(overrides: Partial<ReminderState> = {}): ReminderState {
  return {
    now: NOW,
    time: { hour: 19, minute: 0 },
    plan: null,
    planLessons: [],
    progressLessons: {},
    lessonCards: [],
    allSurahs: SURAHS,
    todayDone: false,
    streak: 0,
    ...overrides,
  };
}

describe('planReminders', () => {
  it('schedules nothing for someone who has nothing to do and has never started', () => {
    expect(planReminders(state())).toEqual([]);
  });

  it('names the streams, reminds daily for a week at the chosen time, then one comeback', () => {
    const r = planReminders(state({ lessonCards: [card('78-2', NOW - DAY)] }));
    expect(r).toHaveLength(DAILY_REMINDER_DAYS + 1);
    expect(r[0]).toMatchObject({ id: REMINDER_ID_BASE, at: at(0, 19), body: 'Manzil: 1 review', url: '/review' });
    expect(r.slice(0, DAILY_REMINDER_DAYS).map((x) => x.at)).toEqual(
      Array.from({ length: DAILY_REMINDER_DAYS }, (_, d) => at(d, 19)),
    );
    expect(r.at(-1)).toMatchObject({ id: REMINDER_ID_BASE + COMEBACK_DAY, at: at(COMEBACK_DAY, 19), url: '/' });
  });

  it('skips today once today is done, and puts the streak on the reminder that decides it', () => {
    const cards = [card('78-2', NOW - DAY)];
    const notDone = planReminders(state({ lessonCards: cards, streak: 12 }));
    expect(notDone[0].title).toBe('Keep your 12-day streak going');
    expect(notDone[1].title).toBe("Today's hifdh");

    const done = planReminders(state({ lessonCards: cards, streak: 12, todayDone: true }));
    expect(done[0].at).toBe(at(1, 19));
    expect(done[0].title).toBe('Keep your 12-day streak going');
  });

  it("starts tomorrow when today's time has passed — without claiming a streak it can't save", () => {
    const r = planReminders(state({ lessonCards: [card('78-2', NOW - DAY)], streak: 5, time: { hour: 9, minute: 30 } }));
    expect(r[0].at).toBe(at(1, 9, 30));
    expect(r[0].title).toBe("Today's hifdh");
  });

  it('stays quiet until reviews actually fall due', () => {
    const r = planReminders(state({ lessonCards: [card('78-2', at(3, 8))] }));
    expect(r.filter((x) => x.id !== REMINDER_ID_BASE + COMEBACK_DAY).map((x) => x.at)).toEqual([at(3, 19), at(4, 19), at(5, 19), at(6, 19)]);
  });

  it("follows the plan: today's new lesson by name, deep-linking to Today's Plan", () => {
    const plan = {
      id: 'p', createdAt: NOW, goalType: 'custom', goalSurahIds: [1, 78], goalJuzNumbers: [], deadline: null,
      knownSurahIds: [], knownLessonIds: [], lessonsPerDay: 1, studyDays: [0, 1, 2, 3, 4, 5, 6],
      completedLessonIds: [], revisionFrequencyDays: 7, revisionFrequencyAuto: false, lastRevisedAt: {},
      catchUpDate: null, catchUpBonus: 0, finishCelebrated: false,
    } as unknown as HifdhPlan;
    const r = planReminders(state({ plan, planLessons: getPlanLessons(plan, SURAHS, JUZ) }));
    expect(r[0]).toMatchObject({ at: at(0, 19), body: 'New: Al-Fatiha lesson 1', url: '/' });
  });

  it('without a plan or anything due, points back to the lesson left mid-way', () => {
    const progress = {
      '78-3': { lessonId: '78-3', surahId: 78, currentPhase: 'chunk', startedAt: NOW - DAY, completedAt: null },
    } as unknown as Record<string, LessonProgress>;
    const r = planReminders(state({ progressLessons: progress }));
    expect(r[0].body).toBe('Pick up An-Naba lesson 3 where you left off');
  });
});
