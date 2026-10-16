'use client';

import { useEffect, useState } from 'react';
import type { Ayah } from '@/types/quran';
import { getSurah } from '@/lib/quran-data';
import { getWeakAyahs } from '@/lib/retention';
import { useReviewStore } from '@/stores/review-store';
import { useAppBack } from '@/hooks/use-app-back';
import PracticeSession from '@/components/practice/practice-session';
import CloseButton from '@/components/ui/close-button';
import SettingsPanel from '@/components/layout/settings-panel';
import { SkeletonRows } from '@/components/ui/skeleton';

/**
 * Drill your weakest ayahs (M10): about five minutes, one ayah at a time, across
 * surahs. The list comes from your ratings (getWeakAyahs: leeches first), and each
 * rating here updates that ayah's review schedule like any other review.
 */
export default function DrillClient() {
  const close = useAppBack('/review');
  // Picked once on arrival, so rating an ayah doesn't reshuffle the session
  const [weak] = useState(() => getWeakAyahs(useReviewStore.getState().cards));
  const [data, setData] = useState<{ ayahs: Ayah[]; names: Record<number, string> } | null>(null);

  useEffect(() => {
    let live = true;
    const ids = [...new Set(weak.map((c) => c.surahId))];
    Promise.all(ids.map((id) => getSurah(id))).then((surahs) => {
      if (!live) return;
      const byId = new Map(surahs.map((s) => [s.id, s]));
      setData({
        ayahs: weak.map((c) => byId.get(c.surahId)?.ayahs[c.ayahNumber - 1]).filter((a): a is Ayah => !!a),
        names: Object.fromEntries(surahs.map((s) => [s.id, s.nameSimple])),
      });
    });
    return () => { live = false; };
  }, [weak]);

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <CloseButton fallback="/review" label="Close drill" />
          <span className="text-sm font-semibold text-teal">Weakest ayahs</span>
          <SettingsPanel />
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-5">
        {weak.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold text-foreground">Nothing to drill yet</p>
            <p className="mt-2 text-sm text-muted">Ayahs you miss or find shaky in reviews will collect here.</p>
          </div>
        ) : !data ? (
          <SkeletonRows count={4} />
        ) : (
          <PracticeSession
            surahIds={[...new Set(weak.map((c) => c.surahId))]}
            title="Weakest ayahs"
            ayahs={data.ayahs}
            lessonIds={[]}
            surahNames={data.names}
            initialStep="ayah-by-ayah"
            onDone={close}
          />
        )}
      </main>
    </div>
  );
}
