'use client';

import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useReaderStore } from '@/stores/reader-store';
import { upcoming } from '@/lib/upcoming';
import { khatmStatus } from '@/lib/khatm';
import { addDaysIso, todayIso } from '@/lib/dates';

interface WidgetPlugin { update(data: { due: Record<string, number>; streak: number; khatm: string }): Promise<void> }
const Widget = registerPlugin<WidgetPlugin>('TakrarWidget');

/**
 * Feeds the home-screen widget (roadmap #17): the next week's due reviews by
 * date (the widget picks today's itself), the live streak, and the khatm line.
 * Android app only; renders nothing.
 */
export default function WidgetSync() {
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const cards = useReviewStore((s) => s.cards);
  const streak = useStatsStore((s) => s.currentStreak);
  const lastActiveDate = useStatsStore((s) => s.lastActiveDate);
  const hideStats = useSettingsStore((s) => !!s.hideStats);
  const khatm = useReaderStore((s) => s.khatm);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('TakrarWidget')) return;
    const t = setTimeout(() => {
      const due: Record<string, number> = {};
      for (const d of upcoming(lessonCards, cards)) due[d.iso] = d.lessons + d.ayahs;
      const alive = lastActiveDate && lastActiveDate >= addDaysIso(todayIso(), -1) ? streak : 0;
      let line = '';
      if (khatm && !khatm.endedAt) {
        const s = khatmStatus(khatm);
        line = s.finished ? 'Khatm complete' : s.behind > 0 ? `Khatm: ${s.behind} pages to read` : 'Khatm on track';
      }
      void Widget.update({ due, streak: hideStats ? 0 : alive, khatm: line }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [lessonCards, cards, streak, lastActiveDate, hideStats, khatm]);

  return null;
}
