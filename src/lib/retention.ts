// Retention engine v2 (M5) — PURE scheduling: no DOM, no stores, no clocks
// (callers pass `now`). Sits ON TOP of unchanged SM-2 and re-buckets the day's
// review work into the three streams of the traditional hifdh cycle:
//
//   Sabaq  — new memorization (today's new lessons; lives in plan.ts)
//   Sabqi  — the recent portion: lessons completed in the last SABQI_WINDOW_DAYS.
//            SM-2 alone touches a new lesson on days 1, 2, 5 and 12 — gaps a
//            memorizer would never leave — so untouched recent lessons also get
//            capped "early touches" (reviewed without advancing their SM-2 state).
//   Manzil — everything older: mature SM-2 lesson reviews, plus a whole-surah
//            ROTATION that cycles every memorized surah regardless of SM-2's
//            predictions (least-recently-touched first, under a daily budget).

import type { LessonProgress, LessonReviewCard, ReviewCard } from '@/types/quran';
import { startOfDayMs } from './dates';

const DAY_MS = 86_400_000;

/** Tunables — single numbers, deliberately listed in one place. */
export const RETENTION = {
  /** A lesson counts as sabqi (recent) for this many days after completion */
  SABQI_WINDOW_DAYS: 14,
  /** Recent lessons untouched for this many days get an early touch */
  SABQI_MAX_GAP_DAYS: 3,
  /** Max recent lessons touched per day before early touches stop being added */
  SABQI_DAILY_CAP: 4,
  /** Manzil ayah budget floor per day (raised automatically so the cycle stays feasible) */
  MANZIL_MIN_DAILY_AYAHS: 20,
  /** Review sessions run in batches of this many lessons, with a continue/stop break */
  REVIEW_BATCH_SIZE: 10,
  /** An ayah failed this many reviews IN A ROW is a leech — flagged for focused drilling */
  LEECH_THRESHOLD: 3,
} as const;

// ---------- Sabqi / manzil split of the lesson-review queue ----------

export type Stream = 'sabqi' | 'manzil';

function lastTouch(card: LessonReviewCard, progress?: LessonProgress): number {
  return Math.max(card.lastReview ?? 0, progress?.completedAt ?? 0);
}

/** Recent (sabqi) = completed within the window. Cards with no completion record
 *  (e.g. minted by practice) fall back to SM-2 youth: still in the 1/3/7 ladder. */
export function streamOf(card: LessonReviewCard, progress: LessonProgress | undefined, now: number): Stream {
  const completedAt = progress?.completedAt;
  if (completedAt) return now - completedAt < RETENTION.SABQI_WINDOW_DAYS * DAY_MS ? 'sabqi' : 'manzil';
  return card.repetitions < 3 ? 'sabqi' : 'manzil';
}

export interface ReviewQueue {
  /** Recent lessons: SM-2-due first (most overdue first), then early touches */
  sabqi: LessonReviewCard[];
  /** Older lessons due under SM-2, most overdue first */
  manzil: LessonReviewCard[];
  /** Sabqi lessons included ahead of their SM-2 date — review them with processEarlyLessonReview */
  earlyIds: Set<string>;
  /** Of the SM-2-due lessons, how many were already due before today */
  overdueCount: number;
}

export function buildReviewQueue(
  lessonCards: LessonReviewCard[],
  progressLessons: Record<string, LessonProgress>,
  now: number,
): ReviewQueue {
  const todayStart = startOfDayMs(now);
  const dueSabqi: LessonReviewCard[] = [];
  const dueManzil: LessonReviewCard[] = [];
  const earlyCandidates: LessonReviewCard[] = [];
  let touchedTodayRecent = 0;

  for (const card of lessonCards) {
    const progress = progressLessons[card.lessonId];
    const stream = streamOf(card, progress, now);
    if (card.nextReview <= now) {
      (stream === 'sabqi' ? dueSabqi : dueManzil).push(card);
      continue;
    }
    if (stream !== 'sabqi') continue;
    const touched = lastTouch(card, progress);
    if (touched >= todayStart) touchedTodayRecent++;
    else if (now - touched >= RETENTION.SABQI_MAX_GAP_DAYS * DAY_MS) earlyCandidates.push(card);
  }

  const byDue = (a: LessonReviewCard, b: LessonReviewCard) => a.nextReview - b.nextReview;
  dueSabqi.sort(byDue);
  dueManzil.sort(byDue);

  // Early touches fill whatever the daily recent-lesson cap leaves. Lessons already
  // touched today count against it, so finishing one never pulls in another
  // (a checklist that refills as you complete it is a treadmill, not a plan).
  const slots = Math.max(0, RETENTION.SABQI_DAILY_CAP - touchedTodayRecent - dueSabqi.length);
  earlyCandidates.sort((a, b) =>
    lastTouch(a, progressLessons[a.lessonId]) - lastTouch(b, progressLessons[b.lessonId]));
  const early = earlyCandidates.slice(0, slots);

  return {
    sabqi: [...dueSabqi, ...early],
    manzil: dueManzil,
    earlyIds: new Set(early.map((c) => c.lessonId)),
    overdueCount: [...dueSabqi, ...dueManzil].filter((c) => c.nextReview < todayStart).length,
  };
}

// ---------- Manzil rotation planner ----------

export interface ManzilItem {
  surahId: number;
  /** Ayahs in the revision scope — the unit of daily load */
  ayahCount: number;
  /** Last full-surah recall (or completion / marking known) */
  lastTouched: number;
}

export interface ManzilPlan {
  /** Surahs to revise today (not yet revised today), least-recently-touched first */
  today: number[];
  /** Day offset (0 = today) each surah is next scheduled for — ≤ cycleDays for all */
  scheduledDay: Record<number, number>;
  /** Daily ayah budget the plan was built with */
  budget: number;
}

/**
 * Cycle every memorized surah within `cycleDays`, spreading the load so no day
 * floods (audit M15). Earliest-deadline-first under a daily ayah budget:
 *  - a surah is due `cycleDays` after it was last touched;
 *  - each day takes due surahs, least-recently-touched first, until the budget
 *    is spent (always at least one, so an oversized surah gets its own day);
 *  - it pulls a not-yet-due surah forward ONLY when upcoming load would
 *    otherwise exceed capacity — small collections are not over-revised;
 *  - surahs already revised today consume today's budget, so completing one
 *    never pulls another in.
 * The budget is max(floor, 2·total/cycle): twice the average load guarantees
 * greedy day-packing still clears a full cycle in time.
 */
export function planManzil(
  items: ManzilItem[],
  opts: { cycleDays: number; now: number; minDailyAyahs?: number },
): ManzilPlan {
  const cycle = Math.max(1, Math.round(opts.cycleDays));
  const todayStart = startOfDayMs(opts.now);
  const total = items.reduce((s, it) => s + it.ayahCount, 0);
  const budget = Math.max(opts.minDailyAyahs ?? RETENTION.MANZIL_MIN_DAILY_AYAHS, Math.ceil((2 * total) / cycle));
  const scheduledDay: Record<number, number> = {};
  if (items.length === 0) return { today: [], scheduledDay, budget };

  const dayOf = (ts: number) => Math.round((startOfDayMs(ts) - todayStart) / DAY_MS);

  let usedToday = 0;
  type Pending = ManzilItem & { due: number };
  let pending: Pending[] = [];
  for (const it of items) {
    if (it.lastTouched >= todayStart) {
      usedToday += it.ayahCount; // revised today — done, and it counts against today
      scheduledDay[it.surahId] = cycle;
    } else {
      pending.push({ ...it, due: Math.max(0, dayOf(it.lastTouched) + cycle) });
    }
  }
  pending.sort((a, b) => a.due - b.due || a.lastTouched - b.lastTouched || a.surahId - b.surahId);

  const today: number[] = [];
  for (let day = 0; pending.length > 0 && day <= cycle * 4; day++) {
    let used = day === 0 ? usedToday : 0;
    let tookAny = day === 0 && usedToday > 0;

    // Would the remaining load due within some horizon h overflow h days of capacity?
    const mustPull = (rest: Pending[]) => {
      let cum = 0;
      for (const p of rest) {
        cum += p.ayahCount;
        const h = p.due - day; // days AFTER today available for work due by p.due
        if (h >= 1 && cum > h * budget) return true;
      }
      return false;
    };

    const kept: Pending[] = [];
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];
      const fits = used + p.ayahCount <= budget || !tookAny;
      // Surahs skipped earlier today (didn't fit) are still future load — count them
      const wanted = p.due <= day || mustPull([...kept, ...pending.slice(i)]);
      if (fits && wanted) {
        used += p.ayahCount;
        tookAny = true;
        scheduledDay[p.surahId] = day;
        if (day === 0) today.push(p.surahId);
      } else {
        kept.push(p);
      }
    }
    pending = kept;
  }
  for (const p of pending) scheduledDay[p.surahId] = cycle; // unreachable safety net

  return { today, scheduledDay, budget };
}

// ---------- Leeches ----------

/** Ayah cards failed LEECH_THRESHOLD+ reviews in a row — worst first. */
export function getLeeches(cards: ReviewCard[]): ReviewCard[] {
  return cards
    .filter((c) => (c.failStreak ?? 0) >= RETENTION.LEECH_THRESHOLD)
    .sort((a, b) => (b.failStreak ?? 0) - (a.failStreak ?? 0) || a.surahId - b.surahId || a.ayahNumber - b.ayahNumber);
}
