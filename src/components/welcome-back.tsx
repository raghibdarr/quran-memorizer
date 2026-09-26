'use client';

import { useStatsStore } from '@/stores/stats-store';
import { useReentryDay } from '@/hooks/use-reentry';
import { useReviewQueue } from '@/hooks/use-review-queue';
import Button from '@/components/ui/button';
import BottomSheet from '@/components/ui/bottom-sheet';
import { FlameIcon } from '@/components/ui/icons';

/**
 * Welcome-back moment (M7, audit M12/m14): shown once when someone returns after
 * a long gap, before any tap. It names the gap, keeps the streak they HAD in view
 * (a silent reset to 1 reads as "all that was for nothing"), and explains why
 * today is deliberately small. Restore, not zero.
 */
export default function WelcomeBack() {
  const reentry = useStatsStore((s) => s.reentry);
  const longestStreak = useStatsStore((s) => s.longestStreak);
  const acknowledge = useStatsStore((s) => s.acknowledgeReentry);
  const day = useReentryDay();
  const { dueCount, deferredCount } = useReviewQueue();

  const open = !!reentry && !reentry.acknowledged && day !== null;
  if (!reentry) return null;

  const streakLine =
    reentry.streakBefore > 1
      ? `Your ${reentry.streakBefore}-day streak paused while you were away — your best is still ${Math.max(longestStreak, reentry.streakBefore)} days. Today starts the next one.`
      : longestStreak > 1
        ? `Your best streak is ${longestStreak} days. Today starts the next one.`
        : null;

  return (
    <BottomSheet open={open} onClose={acknowledge} title="Welcome back" className="text-center">
      <div className="pb-1">
        <p className="text-sm text-muted">
          It&apos;s been {reentry.gapDays} days. What you memorized is still here — and so is every bit of your progress.
        </p>
        {streakLine && (
          <p className="mt-3 flex items-start justify-center gap-1.5 text-left text-sm text-gold-deep">
            <FlameIcon size={16} className="mt-0.5 shrink-0" />
            <span>{streakLine}</span>
          </p>
        )}
        <div className="mt-4 rounded-xl bg-teal/5 p-3 text-left text-sm text-foreground">
          <p className="font-semibold">Today is lighter on purpose</p>
          <p className="mt-0.5 text-xs text-muted">
            {dueCount > 0 ? `Your ${dueCount} weakest reviews first` : 'A gentle start'}
            {day === 0 ? ', no new lessons' : ''}.
            {deferredCount > 0 && ` The other ${deferredCount} are spread over the next few days.`}
          </p>
        </div>
        <Button className="mt-5 w-full" onClick={acknowledge}>
          Ease back in
        </Button>
      </div>
    </BottomSheet>
  );
}
