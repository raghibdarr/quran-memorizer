// Reminder planner (M8, revised: on-device local notifications). Pure — the
// native scheduler (src/lib/reminder-notifications.ts) just hands its output
// to the OS.
//
// Local notifications are scheduled AHEAD, so each one carries a forecast: the
// same planner the app uses (computeTodaysPlan / buildReviewQueue), run as of
// that day, assuming nothing is done in between. Every app open reschedules,
// so an active user's reminders always reflect their real state; a user who
// stops opening the app gets a week of daily reminders, then one comeback
// nudge — never an endless drip.
//
// Rules (build plan §M8): nudge only; nothing fires on a day with nothing to
// do or once today is done; content names the streams ("Sabqi: 2 reviews"),
// not a bare count.

import type { HifdhPlan, LessonDef, LessonProgress, LessonReviewCard, SurahMeta } from '@/types/quran';
import { computeTodaysPlan } from './plan';
import { buildReviewQueue } from './retention';
import { addLocalDays, endOfDayMs } from './dates';
import { RECOVERY } from './recovery';

export const DAILY_REMINDER_DAYS = 7;
/** First day the app greets a returner with the gentle re-entry plan (M7) — the comeback copy promises it */
export const COMEBACK_DAY = RECOVERY.LAPSE_THRESHOLD_DAYS + 1;
/** Notification ids owned by reminders: base + day offset (0..COMEBACK_DAY) */
export const REMINDER_ID_BASE = 7100;
export const REMINDER_IDS = Array.from({ length: COMEBACK_DAY + 1 }, (_, d) => REMINDER_ID_BASE + d);

export interface ReminderTime {
  hour: number;
  minute: number;
}

export interface ReminderState {
  now: number;
  time: ReminderTime;
  plan: HifdhPlan | null;
  planLessons: LessonDef[];
  progressLessons: Record<string, LessonProgress>;
  lessonCards: LessonReviewCard[];
  allSurahs: SurahMeta[];
  /** THE day status (src/lib/day-status.ts) says today is done */
  todayDone: boolean;
  /** Current streak, only if it is still alive (last active today or yesterday) */
  streak: number;
}

export interface Reminder {
  id: number;
  at: number;
  title: string;
  body: string;
  /** In-app route the tap opens */
  url: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function atOnDay(now: number, dayOffset: number, time: ReminderTime): number {
  const d = new Date(addLocalDays(now, dayOffset));
  d.setHours(time.hour, time.minute, 0, 0);
  return d.getTime();
}

/** What a day holds, as notification copy — null when there's nothing to do */
function dayContent(state: ReminderState, dayEnd: number): { body: string; url: string } | null {
  const name = (surahId: number) => state.allSurahs.find((s) => s.id === surahId)?.nameSimple ?? `Surah ${surahId}`;

  if (state.plan) {
    const tp = computeTodaysPlan(state.plan, state.planLessons, state.progressLessons, state.lessonCards, state.allSurahs, dayEnd);
    const pendingNew = tp.newLessons.filter((l) => !tp.completedNewLessonIds.includes(l.lessonId));
    const parts: string[] = [];
    if (tp.sabqi.length) parts.push(`Sabqi: ${plural(tp.sabqi.length, 'review')}`);
    const manzil: string[] = [];
    if (tp.manzil.length) manzil.push(plural(tp.manzil.length, 'review'));
    if (tp.revisions.length === 1) manzil.push(`revise ${tp.revisions[0].surahName}`);
    else if (tp.revisions.length > 1) manzil.push(`revise ${plural(tp.revisions.length, 'surah')}`);
    if (manzil.length) parts.push(`Manzil: ${manzil.join(', ')}`);
    if (pendingNew.length) parts.push(`New: ${name(pendingNew[0].surahId)} lesson ${pendingNew[0].lessonNumber}`);
    return parts.length ? { body: parts.join(' · '), url: '/' } : null;
  }

  const q = buildReviewQueue(state.lessonCards, state.progressLessons, dayEnd);
  const parts: string[] = [];
  if (q.sabqi.length) parts.push(`Sabqi: ${plural(q.sabqi.length, 'review')}`);
  if (q.manzil.length) parts.push(`Manzil: ${plural(q.manzil.length, 'review')}`);
  if (parts.length) return { body: parts.join(' · '), url: '/review' };

  // No plan and nothing due: pick up the lesson left mid-way, if any
  const inProgress = Object.values(state.progressLessons)
    .filter((p) => p.completedAt == null)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!inProgress) return null;
  const lessonNumber = Number(inProgress.lessonId.split('-')[1]);
  return { body: `Pick up ${name(inProgress.surahId)} lesson ${lessonNumber} where you left off`, url: '/' };
}

export function planReminders(state: ReminderState): Reminder[] {
  const out: Reminder[] = [];

  for (let d = 0; d < DAILY_REMINDER_DAYS; d++) {
    const at = atOnDay(state.now, d, state.time);
    if (at <= state.now) continue;
    if (d === 0 && state.todayDone) continue;
    const content = dayContent(state, endOfDayMs(at));
    if (!content) continue;
    // The streak line only on the very next reminder: the one whose day decides it
    const streakDecides = out.length === 0 && state.streak > 0 && (d === 0 || (d === 1 && state.todayDone));
    out.push({
      id: REMINDER_ID_BASE + d,
      at,
      title: streakDecides ? `Keep your ${state.streak}-day streak going` : "Today's hifdh",
      ...content,
    });
  }

  // One comeback nudge after the daily run ends — for someone who has started
  const hasStarted = state.lessonCards.length > 0 || Object.keys(state.progressLessons).length > 0;
  if (hasStarted) {
    out.push({
      id: REMINDER_ID_BASE + COMEBACK_DAY,
      at: atOnDay(state.now, COMEBACK_DAY, state.time),
      title: 'Your hifdh is waiting',
      body: 'Your first day back is short, with your weakest reviews first. Nothing has piled up.',
      url: '/',
    });
  }
  return out;
}
