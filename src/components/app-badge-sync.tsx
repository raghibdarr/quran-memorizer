'use client';

import { useEffect, useRef } from 'react';
import { useTodaysPlan } from '@/hooks/use-todays-plan';
import { useReviewQueue } from '@/hooks/use-review-queue';
import { isNative } from '@/lib/native';

type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * App-icon badge (M6, notifications tier 0 — no permission, no server): when the
 * user leaves the app the installed icon shows what's left today (plan items,
 * or due reviews without a plan); opening the app clears it. Web Badging API
 * only — installed PWAs on desktop Chrome/Edge and iOS 16.4+ standalone. The
 * native apps badge through local notifications (M8).
 */
export default function AppBadgeSync() {
  const { plan, dayStatus } = useTodaysPlan();
  const { dueCount } = useReviewQueue();
  const pending = plan ? dayStatus.remaining : dueCount;
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const nav = navigator as BadgingNavigator;
    if (isNative() || !nav.setAppBadge || !nav.clearAppBadge) return;

    const sync = () => {
      if (document.hidden && pendingRef.current > 0) nav.setAppBadge!(pendingRef.current).catch(() => {});
      else nav.clearAppBadge!().catch(() => {});
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  return null;
}
