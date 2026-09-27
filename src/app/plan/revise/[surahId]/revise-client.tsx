'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Ayah, JuzMeta, Surah, SurahMeta } from '@/types/quran';
import { getJuzIndex, getSurah, getSurahIndex } from '@/lib/quran-data';
import { getPlanLessons } from '@/lib/plan';
import { usePlanStore } from '@/stores/plan-store';
import { useStatsStore } from '@/stores/stats-store';
import PracticeSession from '@/components/practice/practice-session';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { StarIcon } from '@/components/ui/icons';
import { useAppBack } from '@/hooks/use-app-back';
import { inTodayRun, useContinueToday } from '@/hooks/use-today-run';

// Revision is a RECALL TEST, not a read-through (M4, audit m8/§4a-6): each ayah
// starts hidden, the user recites from memory, reveals to check, and self-rates.
// Ratings feed the same SM-2 ayah cards as practice — revision and review are
// one system, so the health dashboard reflects how revision actually went.

export default function RevisePage() {
  const params = useParams();
  const id = parseInt(params.surahId as string, 10);
  const router = useRouter();

  const plan = usePlanStore((s) => s.plan);
  const markSurahRevised = usePlanStore((s) => s.markSurahRevised);
  const recordActivity = useStatsStore((s) => s.recordActivity);
  const setLastActivity = useStatsStore((s) => s.setLastActivity);

  const [surah, setSurah] = useState<Surah | null>(null);
  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    getSurah(id).then(setSurah).catch(() => setSurah(null));
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, [id]);

  // Determine which ayahs are in the plan's scope for this surah. Known surahs
  // carry no plan lessons, so they (like no-plan visitors) get the whole surah.
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

  const leave = useAppBack('/');
  const continueToday = useContinueToday();
  const finishRevision = () => {
    markSurahRevised(id);
    if (surah) {
      setLastActivity({
        type: 'practice',
        url: `/plan/revise/${id}`,
        label: `Revised ${surah.nameSimple}`,
        timestamp: Date.now(),
      });
    }
    if (inTodayRun()) continueToday();
    else leave();
  };

  if (!surah) {
    return (
      <div className="min-h-dvh bg-cream p-6">
        <p className="text-center text-sm text-muted">Loading surah…</p>
      </div>
    );
  }

  const lastRevised = plan?.revisedAt?.[id] ?? null;

  return (
    <div className="min-h-dvh bg-cream pb-16">
      <header className="sticky top-[var(--safe-top)] z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
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
        {!started ? (
          <>
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
                    Every ayah starts hidden. Recite out loud, reveal to check yourself, and rate honestly —
                    your ratings keep the health dashboard truthful.
                  </p>
                  {lastRevised && (
                    <p className="mt-1 text-[11px] text-muted/70">
                      Last revised {new Date(lastRevised).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </p>
                  )}
                </div>
              </div>
            </Card>
            <Button className="w-full" onClick={() => setStarted(true)}>
              Start recall test ({scopedAyahs.length} ayahs)
            </Button>
            <div className="flex flex-col items-center gap-1 pt-1">
              <button
                onClick={() => { recordActivity(); finishRevision(); }}
                className="text-xs font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                I revised this elsewhere — just mark it revised
              </button>
            </div>
          </>
        ) : (
          <PracticeSession
            surahIds={[id]}
            title={`Revise ${surah.nameSimple}`}
            ayahs={scopedAyahs}
            lessonIds={[]}
            initialStep="full-passage"
            onDone={finishRevision}
          />
        )}
      </main>

      {!started && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-foreground/5 bg-cream/95 p-4 backdrop-blur-sm" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto max-w-2xl">
            <Button variant="ghost" className="w-full" onClick={leave}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
