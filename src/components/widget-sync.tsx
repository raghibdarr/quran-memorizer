'use client';

import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useReaderStore } from '@/stores/reader-store';
import { usePlaceStore } from '@/stores/place-store';
import { calcSettingsOf, usePrayerStore } from '@/stores/prayer-store';
import { upcoming } from '@/lib/upcoming';
import { khatmStatus } from '@/lib/khatm';
import { addDaysIso, todayIso } from '@/lib/dates';
import { getSurahIndex } from '@/lib/quran-data';
import { RECITERS, isSurahAudio, surahAudioFallback } from '@/lib/reciters';
import { TakrarWidget, type TakrarWidgetData } from '@/lib/native-plugins';
import type { PrayerWidgetPayload } from '@/lib/prayer/widget-payload';

interface LibraryPlugin { setLibrary(data: { reciter: string; reciterName: string; fallback: string; surahAudio: boolean; names: string[]; counts: number[] }): Promise<void> }
const Library = registerPlugin<LibraryPlugin>('RecitationPlayer');

/** What the widget plugin stores: the v2 data plus the zone the prayer times are in */
export type WidgetPayload = TakrarWidgetData & { prayerTz?: string };

/**
 * The widget's data. `prayers` is left out when there's no place (or nothing to
 * show), which hides the widget's "Next" line; `prayerTz` lets the widget show the
 * times in the place's zone, as the app does.
 */
export function widgetData(base: Omit<TakrarWidgetData, 'prayers'>, payload: PrayerWidgetPayload | null, tz?: string): WidgetPayload {
  if (!payload || payload.prayers.length === 0) return { ...base };
  return { ...base, prayers: payload.prayers, ...(tz ? { prayerTz: tz } : {}) };
}

/** Coming back to the app re-sends at most this often (the prayer list covers a week) */
const RESEND_ON_RESUME_MS = 60 * 60_000;

/**
 * Feeds the home-screen widget (roadmap #17): the next week's due reviews by
 * date (the widget picks today's itself), the live streak, the khatm line, and,
 * once a place is set, the next week's prayers (all-in-one spec 3.4; the widget
 * picks the next one itself). Also tells the native player what Android Auto can
 * browse. Android app only; renders nothing. The single writer of the widget's data.
 */
export default function WidgetSync() {
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const cards = useReviewStore((s) => s.cards);
  const streak = useStatsStore((s) => s.currentStreak);
  const lastActiveDate = useStatsStore((s) => s.lastActiveDate);
  const hideStats = useSettingsStore((s) => !!s.hideStats);
  const khatm = useReaderStore((s) => s.khatm);
  const place = usePlaceStore((s) => s.place);
  // A string, so the effect reruns only when the calculation really changes
  const calcKey = usePrayerStore((s) => JSON.stringify(calcSettingsOf(s)));

  // Bumped when the app comes back to the foreground, so a long-lived session
  // doesn't let the widget's week of prayer times run out
  const [resumeTick, setResumeTick] = useState(0);
  useEffect(() => {
    if (!TakrarWidget.available()) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < RESEND_ON_RESUME_MS) return;
      last = Date.now();
      setResumeTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!TakrarWidget.available()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      const due: Record<string, number> = {};
      for (const d of upcoming(lessonCards, cards)) due[d.iso] = d.lessons + d.ayahs;
      const alive = lastActiveDate && lastActiveDate >= addDaysIso(todayIso(), -1) ? streak : 0;
      let line = '';
      if (khatm && !khatm.endedAt) {
        const s = khatmStatus(khatm);
        line = s.finished ? 'Khatm complete' : s.behind > 0 ? `Khatm: ${s.behind} pages to read` : 'Khatm on track';
      }
      const base = { due, streak: hideStats ? 0 : alive, khatm: line };
      // Loaded only here: the prayer engine (and adhan) stay out of every screen's first load
      const prayers = place
        ? import('@/lib/prayer/widget-payload').then((m) => m.prayerWidgetPayload()).catch(() => null)
        : Promise.resolve(null);
      void prayers.then((payload) => {
        if (!cancelled) void TakrarWidget.update(widgetData(base, payload, place?.tz));
      });
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [lessonCards, cards, streak, lastActiveDate, hideStats, khatm, place, calcKey, resumeTick]);

  // What Android Auto can browse: the current reciter's surahs (roadmap #20)
  const reciter = useSettingsStore((s) => s.reciter);
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('RecitationPlayer')) return;
    void getSurahIndex().then((idx) => {
      const sorted = [...idx].sort((a, b) => a.id - b.id);
      return Library.setLibrary({
        reciter,
        reciterName: RECITERS.find((r) => r.id === reciter)?.name ?? '',
        fallback: surahAudioFallback(reciter),
        surahAudio: isSurahAudio(reciter),
        names: sorted.map((s) => s.nameSimple),
        counts: sorted.map((s) => s.versesCount),
      });
    }).catch(() => {});
  }, [reciter]);

  return null;
}
