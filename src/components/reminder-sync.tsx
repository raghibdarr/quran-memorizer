'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTodaysPlan } from '@/hooks/use-todays-plan';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { useReminderStore } from '@/stores/reminder-store';
import { planReminders } from '@/lib/reminders';
import { applyReminders, onReminderTap } from '@/lib/reminder-notifications';
import { addDaysIso } from '@/lib/dates';
import { isNative } from '@/lib/native';

const RESCHEDULE_DEBOUNCE_MS = 1500;

/**
 * Keeps this device's scheduled reminders (M8) in step with the user's real
 * state: every change to progress, reviews or the plan — and every return to the
 * app — replans the next two weeks. Also routes reminder taps into the app.
 * Native shells only; renders nothing.
 */
export default function ReminderSync() {
  const router = useRouter();
  const enabled = useReminderStore((s) => s.enabled);
  const time = useReminderStore((s) => s.time);
  const { plan, planLessons, allSurahs, dayStatus, today, ready } = useTodaysPlan();
  const progressLessons = useProgressStore((s) => s.lessons);
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const streak = useStatsStore((s) => s.currentStreak);
  const lastActiveDate = useStatsStore((s) => s.lastActiveDate);
  // Bumped on every return to the foreground: "now" has moved on
  const [wake, setWake] = useState(0);

  useEffect(() => {
    if (!isNative()) return;
    const onVisible = () => {
      if (!document.hidden) setWake((w) => w + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    const stopTaps = onReminderTap((url) => router.push(url));
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stopTaps();
    };
  }, [router]);

  // A streak is only worth naming while it's alive (last active today or yesterday)
  const liveStreak = useMemo(
    () => (lastActiveDate && lastActiveDate >= addDaysIso(today, -1) ? streak : 0),
    [streak, lastActiveDate, today],
  );

  useEffect(() => {
    if (!isNative() || !ready) return;
    const t = setTimeout(() => {
      const reminders = enabled
        ? planReminders({
            now: Date.now(),
            time,
            plan,
            planLessons,
            progressLessons,
            lessonCards,
            allSurahs,
            todayDone: dayStatus.complete,
            streak: liveStreak,
          })
        : [];
      applyReminders(reminders).catch(() => {});
    }, RESCHEDULE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [enabled, time, plan, planLessons, progressLessons, lessonCards, allSurahs, dayStatus.complete, liveStreak, ready, wake]);

  return null;
}
