'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Ayah, JuzMeta, Surah, SurahMeta } from '@/types/quran';
import { getJuzIndex, getSurah, getSurahIndex } from '@/lib/quran-data';
import { getPlanLessons } from '@/lib/plan';
import { usePlanStore } from '@/stores/plan-store';
import { useStatsStore } from '@/stores/stats-store';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { StarIcon } from '@/components/ui/icons';

export default function RevisePage({ params }: { params: Promise<{ surahId: string }> }) {
  const { surahId } = use(params);
  const id = parseInt(surahId, 10);
  const router = useRouter();

  const plan = usePlanStore((s) => s.plan);
  const markSurahRevised = usePlanStore((s) => s.markSurahRevised);
  const recordActivity = useStatsStore((s) => s.recordActivity);
  const setLastActivity = useStatsStore((s) => s.setLastActivity);

  const [surah, setSurah] = useState<Surah | null>(null);
  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getSurah(id).then(setSurah).catch(() => setSurah(null));
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, [id]);

  // Determine which ayahs are in the plan's scope for this surah.
  // If no plan, or plan doesn't cover this surah, show the whole surah.
  const { scopedAyahs, isPartial, scopeStart, scopeEnd } = useMemo(() => {
    if (!surah) return { scopedAyahs: [] as Ayah[], isPartial: false, scopeStart: 1, scopeEnd: 0 };
    if (!plan || !allSurahs.length || !juzIndex.length) {
      return {
        scopedAyahs: surah.ayahs,
        isPartial: false,
        scopeStart: 1,
        scopeEnd: surah.versesCount,
      };
    }
    const planLessons = getPlanLessons(plan, allSurahs, juzIndex);
    const surahLessons = planLessons.filter((l) => l.surahId === id);
    if (!surahLessons.length) {
      return {
        scopedAyahs: surah.ayahs,
        isPartial: false,
        scopeStart: 1,
        scopeEnd: surah.versesCount,
      };
    }
    const inScope = (n: number) =>
      surahLessons.some((l) => n >= l.ayahStart && n <= l.ayahEnd);
    const filtered = surah.ayahs.filter((a) => inScope(a.number));
    const start = filtered[0]?.number ?? 1;
    const end = filtered[filtered.length - 1]?.number ?? surah.versesCount;
    const partial = filtered.length < surah.versesCount;
    return { scopedAyahs: filtered, isPartial: partial, scopeStart: start, scopeEnd: end };
  }, [surah, plan, allSurahs, juzIndex, id]);

  const handleDone = () => {
    if (submitted) return;
    setSubmitted(true);
    markSurahRevised(id);
    recordActivity();
    if (surah) {
      setLastActivity({
        type: 'practice',
        url: `/plan/revise/${id}`,
        label: `Revised ${surah.nameSimple}`,
        timestamp: Date.now(),
      });
    }
    router.push('/');
  };

  if (!surah) {
    return (
      <div className="min-h-screen bg-cream p-6">
        <p className="text-center text-sm text-muted">Loading surah…</p>
      </div>
    );
  }

  const lastRevised = plan?.lastRevisedAt[id] ?? null;

  return (
    <div className="min-h-screen bg-cream pb-28">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Revision</p>
            <h1 className="text-xl font-bold text-teal">{surah.nameSimple}</h1>
            {isPartial && (
              <p className="text-[11px] text-muted">Ayahs {scopeStart}–{scopeEnd} of {surah.versesCount}</p>
            )}
          </div>
          <span className="arabic-text text-2xl text-muted">{surah.nameArabic}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-3">
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10">
              <StarIcon size={18} className="text-gold" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isPartial ? 'Recite this portion from memory' : 'Recite from memory'}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {isPartial
                  ? `Recite ayahs ${scopeStart}–${scopeEnd} out loud. The rest of the surah isn't in your plan yet.`
                  : 'Recite the full surah out loud. Use the ayahs below only if you get stuck.'}
              </p>
              {lastRevised && (
                <p className="mt-1 text-[11px] text-muted/70">
                  Last revised {new Date(lastRevised).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card className="space-y-8 py-8">
          {scopedAyahs.map((ayah) => (
            <div key={ayah.number}>
              <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-semibold text-muted">
                <span>Ayah {ayah.number}</span>
              </div>
              <AyahDisplay ayah={ayah} />
            </div>
          ))}
        </Card>
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-foreground/5 bg-cream/95 p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => router.push('/')}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleDone} disabled={submitted}>
            {submitted ? 'Saving…' : 'Mark as revised'}
          </Button>
        </div>
      </div>
    </div>
  );
}
