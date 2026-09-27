'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStatsStore } from '@/stores/stats-store';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useTodaysPlan } from '@/hooks/use-todays-plan';
import { computeGoalAyahProgress, computeTodaysPlan } from '@/lib/plan';
import { shouldCelebrateDay } from '@/lib/day-status';
import { addLocalDays, endOfDayMs } from '@/lib/dates';
import { RECOVERY } from '@/lib/recovery';
import Button from '@/components/ui/button';
import BottomSheet from '@/components/ui/bottom-sheet';
import { CheckIcon, FlameIcon } from '@/components/ui/icons';
import { haptic } from '@/lib/haptics';
import { isNative } from '@/lib/native';
import { turnOnReminders, useReminderStore } from '@/stores/reminder-store';

const timeLabel = (hour: number, minute: number) =>
  new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * The reminder offer (M8), asked at an earned moment — right after finishing a
 * day — rather than on first launch, and only once: either answer is final.
 */
export function ReminderOffer() {
  const enabled = useReminderStore((s) => s.enabled);
  const answered = useReminderStore((s) => s.offerAnswered);
  const answerOffer = useReminderStore((s) => s.answerOffer);
  const time = useReminderStore((s) => s.time);
  const [result, setResult] = useState<'on' | 'blocked' | null>(null);

  if (result === 'on') {
    return <p className="mt-4 text-xs text-muted">Reminder set for {timeLabel(time.hour, time.minute)} — change it in Settings.</p>;
  }
  if (result === 'blocked') {
    return <p className="mt-4 text-xs text-muted">Notifications are off for Takrar — you can allow them in your phone&apos;s settings.</p>;
  }
  if (!isNative() || enabled || answered) return null;

  return (
    <div className="mt-4 rounded-2xl bg-foreground/5 px-4 py-3">
      <p className="text-sm font-medium text-foreground">Want a nudge on days with something to do?</p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={async () => {
            answerOffer();
            setResult(await turnOnReminders());
          }}
          className="pressable min-h-11 rounded-xl bg-teal/10 px-4 text-sm font-semibold text-teal"
        >
          Remind me at {timeLabel(time.hour, time.minute)}
        </button>
        <button type="button" onClick={answerOffer} className="min-h-11 px-3 text-sm text-muted">
          No thanks
        </button>
      </div>
    </div>
  );
}

/** One line tying today to the streak and the goal — shared by Home and lesson-complete */
export function DayCompleteSummary() {
  const { plan, allSurahs, juzIndex, planLessons, dayEnd, reentryDay } = useTodaysPlan();
  const streak = useStatsStore((s) => s.currentStreak);
  const progressLessons = useProgressStore((s) => s.lessons);
  const lessonCards = useReviewStore((s) => s.lessonCards);

  const goal = useMemo(
    () => (plan && allSurahs.length && juzIndex.length && plan.goalType !== 'maintain'
      ? computeGoalAyahProgress(plan, allSurahs, juzIndex, progressLessons)
      : null),
    [plan, allSurahs, juzIndex, progressLessons],
  );

  // Tomorrow's preview: the same planner, run as of the end of tomorrow
  const tomorrow = useMemo(() => {
    if (!plan || !allSurahs.length) return null;
    const tomorrowEnd = endOfDayMs(addLocalDays(dayEnd, 1));
    // A returner's tomorrow is still an easing day: forecast it with the same caps
    const tomorrowReentry = reentryDay != null && reentryDay + 1 < RECOVERY.REENTRY_MAX_DAYS ? reentryDay + 1 : null;
    return computeTodaysPlan(plan, planLessons, progressLessons, lessonCards, allSurahs, tomorrowEnd, { reentryDay: tomorrowReentry });
  }, [plan, planLessons, progressLessons, lessonCards, allSurahs, dayEnd, reentryDay]);

  let tomorrowLine: string | null = null;
  if (tomorrow) {
    const parts = [
      tomorrow.reviews.length > 0 && `${tomorrow.reviews.length} review${tomorrow.reviews.length === 1 ? '' : 's'}`,
      tomorrow.revisions.length > 0 && `${tomorrow.revisions.length} revision${tomorrow.revisions.length === 1 ? '' : 's'}`,
      tomorrow.newLessons.length > 0 && `${tomorrow.newLessons.length} new lesson${tomorrow.newLessons.length === 1 ? '' : 's'}`,
    ].filter(Boolean);
    tomorrowLine = tomorrow.isRestDay
      ? 'Tomorrow is a rest day.'
      : parts.length > 0
        ? `Tomorrow: ${parts.join(' · ')}`
        : 'Nothing scheduled for tomorrow yet.';
  }

  return (
    <div className="space-y-2">
      {streak > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gold-deep">
          <FlameIcon size={14} /> Day {streak} streak
        </p>
      )}
      {goal && (
        <p className="text-xs text-muted">
          {goal.percentage}% of your goal memorized · {goal.memorized} of {goal.total} ayahs
        </p>
      )}
      {tomorrowLine && <p className="text-xs text-muted">{tomorrowLine}</p>}
    </div>
  );
}

/**
 * The Home-screen day-complete moment (M6, audit M6). Shown once per day: it
 * appears the first time the plan's last task is done after real work today, and
 * acknowledging it records the day (synced) so no other device or visit repeats
 * it. Until acknowledged it stays — a moment you never saw hasn't happened.
 */
export default function DayCompleteMoment() {
  const { dayStatus, activitiesToday, ready, today } = useTodaysPlan();
  const celebratedOn = useStatsStore((s) => s.dayCompleteCelebratedOn);
  const markDayCelebrated = useStatsStore((s) => s.markDayCelebrated);

  const open = ready && shouldCelebrateDay(dayStatus, { todayIso: today, celebratedOn, activitiesToday });
  const acknowledge = () => markDayCelebrated(today);
  useEffect(() => {
    if (open) haptic.success();
  }, [open]);

  return (
    <BottomSheet open={open} onClose={acknowledge} title="That's today's plan done" titleHidden>
      <div className="pb-1 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckIcon size={30} />
        </div>
        <p className="mt-4 text-xl font-bold text-foreground" aria-hidden>
          That&apos;s today&apos;s plan done
        </p>
        <p className="mt-1 text-sm text-muted">Every review, revision and lesson — finished.</p>
        <div className="mt-4">
          <DayCompleteSummary />
        </div>
        <ReminderOffer />
        <Button className="mt-5 w-full" onClick={acknowledge}>
          Alhamdulillah
        </Button>
      </div>
    </BottomSheet>
  );
}
