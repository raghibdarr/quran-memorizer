'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { getSurahIndex, getJuzSegmentsForSurah } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import { SyncProvider } from '@/components/sync-provider';
import { rehydrateStores } from '@/lib/sync/rehydrate';
import { useDayRollover } from '@/hooks/use-day-rollover';
import { initNativeShell, isNative } from '@/lib/native';
import AppBadgeSync from '@/components/app-badge-sync';
import EdgeSwipeBack from '@/components/edge-swipe-back';
import { useNavHistoryTracking } from '@/hooks/use-app-back';
import type { LessonReviewCard } from '@/types/quran';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const arabicFontSize = useSettingsStore((s) => s.arabicFontSize);

  // Settle streak state on load / tab return / midnight rollover (M3)
  useDayRollover();
  // In-app back stack + browser-back marking for screen transitions (M11b)
  useNavHistoryTracking();

  useEffect(() => {
    setMounted(true);

    // Apply dark mode — check localStorage first, fallback to system preference
    const saved = localStorage.getItem('quran-dark-mode');
    const isDark = saved !== null
      ? saved === 'true'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);

    // Clean up auth code from URL after OAuth redirect (but not on the callback page — it needs the code)
    if (window.location.search.includes('code=') && !window.location.pathname.startsWith('/auth/callback')) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Service worker: web production only. Unregistered on localhost AND inside the
    // native shells — there the whole app is already bundled on-device
    if ('serviceWorker' in navigator) {
      if (window.location.hostname === 'localhost' || isNative()) {
        navigator.serviceWorker.getRegistrations().then((regs) =>
          regs.forEach((r) => r.unregister())
        );
      } else {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    }

    return initNativeShell();
  }, []);

  // Migration: create lesson review cards for already-completed lessons (runs once)
  // Writes directly to localStorage before Zustand hydrates, then reloads
  useEffect(() => {
    if (!mounted) return;
    const migrationKey = 'lesson-review-migration-v4';
    if (localStorage.getItem(migrationKey)) return;

    const reviewRaw = localStorage.getItem('quran-reviews');
    const reviewParsed = reviewRaw ? JSON.parse(reviewRaw) : { state: { cards: [], lessonCards: [] } };
    const reviewState = reviewParsed.state ?? reviewParsed;
    const existingLessonCards = (reviewState.lessonCards ?? []) as Array<Record<string, unknown>>;
    const existingIds = new Set(existingLessonCards.map((c) => c.lessonId as string));

    const progressRaw = localStorage.getItem('quran-progress');
    const progressState = progressRaw ? (JSON.parse(progressRaw).state ?? JSON.parse(progressRaw)) : {};
    const lessons = (progressState.lessons ?? {}) as Record<string, { completedAt: number | null; surahId: number }>;

    const completedLessons = Object.entries(lessons).filter(
      ([id, p]) => p.completedAt && !existingIds.has(id)
    );

    if (completedLessons.length === 0) {
      localStorage.setItem(migrationKey, '1');
      return;
    }

    // Write directly to localStorage, bypassing Zustand entirely
    (async () => {
      const surahIndex = await getSurahIndex();
      const surahMap = new Map(surahIndex.map((s) => [s.id, s]));
      const newCards = [...existingLessonCards];

      for (const [lessonId, progress] of completedLessons) {
        const surahId = progress.surahId;
        const surah = surahMap.get(surahId);
        if (!surah) continue;

        const juzSegs = await getJuzSegmentsForSurah(surahId);
        const allLessons = generateLessonsWithJuzBoundaries(surahId, surah.versesCount, juzSegs);
        const lessonDef = allLessons.find((l) => l.lessonId === lessonId);
        if (!lessonDef) continue;

        newCards.push({
          lessonId: lessonDef.lessonId,
          surahId,
          lessonNumber: lessonDef.lessonNumber,
          ayahStart: lessonDef.ayahStart,
          ayahEnd: lessonDef.ayahEnd,
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          nextReview: Date.now(), // Due immediately
          lastReview: 0,
          lastQuality: 0,
        });
      }

      reviewState.lessonCards = newCards;
      reviewParsed.state = reviewState;
      localStorage.setItem('quran-reviews', JSON.stringify(reviewParsed));
      localStorage.setItem(migrationKey, '1');
      // Rehydrate the live store in place — no hard reload (M2)
      await rehydrateStores(['quran-reviews']);
    })();
  }, [mounted]);

  useEffect(() => {
    if (mounted) {
      document.documentElement.style.setProperty('--arabic-font-scale', String(arabicFontSize));
    }
  }, [mounted, arabicFontSize]);

  if (!mounted) {
    return null;
  }

  // SyncProvider here (not in UserButton) so cloud sync runs on every route
  return (
    <SyncProvider>
      <AppBadgeSync />
      <EdgeSwipeBack />
      {children}
    </SyncProvider>
  );
}
