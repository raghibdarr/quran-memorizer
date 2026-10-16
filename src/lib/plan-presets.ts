import type { HifdhPlan, JuzMeta, PlanGoalType, SurahMeta } from '@/types/quran';
import { getPlanLessons, resolveGoalSurahIds } from './plan';

/**
 * Ready-made memorisation plans (/plans): each opens the Hifdh Planner's setup filled in
 * (/plan/setup?preset=id), where the learner can still change anything before starting.
 * Written for Takrar; the lessons, pace and reviews are the planner's own.
 */
export interface PlanPreset {
  id: string;
  title: string;
  /** Who it suits and why, in a sentence or two */
  summary: string;
  goalType: PlanGoalType;
  surahIds?: number[];
  juzNumbers?: number[];
  lessonsPerDay: number;
  /** 0 = Sunday … 6 = Saturday */
  studyDays: number[];
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

export const PLAN_PRESETS: PlanPreset[] = [
  {
    id: 'salah-surahs',
    title: 'The surahs for your salah',
    summary: 'Al-Fatihah and the last ten surahs: short, often recited in prayer, and the usual place to start.',
    goalType: 'surah',
    surahIds: [1, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114],
    lessonsPerDay: 1,
    studyDays: EVERY_DAY,
  },
  {
    id: 'juz-amma',
    title: "Juz ʿAmma, one lesson a day",
    summary: 'The thirtieth juz, from An-Naba to An-Nas. Short surahs first, so you finish something every few days.',
    goalType: 'juz',
    juzNumbers: [30],
    lessonsPerDay: 1,
    studyDays: EVERY_DAY,
  },
  {
    id: 'al-mulk',
    title: 'Surah Al-Mulk',
    summary: 'Thirty ayahs that many recite every night. A lesson a day, with reviews as you go.',
    goalType: 'surah',
    surahIds: [67],
    lessonsPerDay: 1,
    studyDays: EVERY_DAY,
  },
  {
    id: 'al-kahf',
    title: 'Surah Al-Kahf, on weekdays',
    summary: 'The surah many read on Fridays, learned on weekdays so the weekend is for revision.',
    goalType: 'surah',
    surahIds: [18],
    lessonsPerDay: 1,
    studyDays: WEEKDAYS,
  },
  {
    id: 'ya-sin',
    title: 'Surah Ya-Sin',
    summary: 'Eighty-three ayahs in short, memorable lines. A good second surah after Juz ʿAmma.',
    goalType: 'surah',
    surahIds: [36],
    lessonsPerDay: 1,
    studyDays: EVERY_DAY,
  },
  {
    id: 'juz-tabarak',
    title: 'Juz Tabarak',
    summary: 'The twenty-ninth juz, from Al-Mulk to Al-Mursalat: the usual next step once Juz ʿAmma is held.',
    goalType: 'juz',
    juzNumbers: [29],
    lessonsPerDay: 1,
    studyDays: EVERY_DAY,
  },
  {
    id: 'whole-quran',
    title: 'The whole Quran, steadily',
    summary: 'Two lessons each weekday, starting from the end of the Quran where the surahs are shortest. Years, not months; the reviews keep everything you have learned.',
    goalType: 'full-quran',
    lessonsPerDay: 2,
    studyDays: WEEKDAYS,
  },
];

export const findPreset = (id: string | null | undefined) => PLAN_PRESETS.find((p) => p.id === id) ?? null;

/** How many lessons the preset holds, and roughly how many weeks at its pace */
export function presetLength(preset: PlanPreset, allSurahs: SurahMeta[], juzIndex: JuzMeta[]): { lessons: number; weeks: number } {
  const goalSurahIds = resolveGoalSurahIds(preset.goalType, { surahIds: preset.surahIds, juzNumbers: preset.juzNumbers }, juzIndex);
  const plan: HifdhPlan = {
    id: 'preset',
    createdAt: 0,
    goalType: preset.goalType,
    goalSurahIds,
    goalJuzNumbers: preset.juzNumbers ?? [],
    deadline: null,
    knownSurahIds: [],
    lessonsPerDay: preset.lessonsPerDay,
    studyDays: preset.studyDays,
    completedLessonIds: [],
    revisionFrequencyDays: 7,
    lastRevisedAt: {},
  };
  const lessons = getPlanLessons(plan, allSurahs, juzIndex).length;
  const weeks = Math.max(1, Math.ceil(lessons / (preset.lessonsPerDay * preset.studyDays.length)));
  return { lessons, weeks };
}

/** "3 weeks", "5 months", "about 4 years" */
export function formatWeeks(weeks: number): string {
  if (weeks < 9) return `${weeks} week${weeks === 1 ? '' : 's'}`;
  const months = Math.round(weeks / 4.35);
  if (months < 24) return `about ${months} months`;
  return `about ${Math.round(weeks / 52)} years`;
}
