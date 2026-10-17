'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import { getJuzIndex, getSurahIndex } from '@/lib/quran-data';
import { PLAN_PRESETS, formatWeeks, presetLength } from '@/lib/plan-presets';
import { usePlanStore } from '@/stores/plan-store';
import type { JuzMeta, SurahMeta } from '@/types/quran';

const DAY_COUNT = (days: number[]) => (days.length === 7 ? 'every day' : days.length === 5 && !days.includes(0) && !days.includes(6) ? 'on weekdays' : `${days.length} days a week`);

/**
 * Ready-made memorisation plans: pick one and the Hifdh Planner opens filled in, ready to
 * adjust. Each card says what's in it, the pace, and roughly how long it takes.
 */
export default function PlansPage() {
  const plan = usePlanStore((s) => s.plan);
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [juz, setJuz] = useState<JuzMeta[]>([]);
  useEffect(() => {
    getSurahIndex().then(setSurahs);
    getJuzIndex().then(setJuz);
  }, []);
  const ready = surahs.length > 0 && juz.length > 0;

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <BackButton fallback="/essentials" />
          <span className="text-sm font-semibold text-teal">Memorisation plans</span>
          <span className="w-11" />
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-[var(--tabbar-clearance)]">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pick a plan</h1>
          <p className="mt-1 text-sm text-muted">
            Each one opens the planner filled in: change the pace or the days before you start. Reviews of what you&apos;ve learned are scheduled for you.
          </p>
          {plan && <p className="mt-2 text-sm font-medium text-gold-deep">Starting a new plan replaces the one you have.</p>}
        </div>

        <ul className="space-y-3" data-plan-presets>
          {PLAN_PRESETS.map((p) => {
            const length = ready ? presetLength(p, surahs, juz) : null;
            return (
              <li key={p.id} className="rounded-2xl bg-card p-4" data-preset={p.id}>
                <h2 className="text-base font-bold text-foreground">{p.title}</h2>
                <p className="mt-1 text-sm text-muted">{p.summary}</p>
                <p className="mt-2 text-xs font-medium text-foreground/80">
                  {p.lessonsPerDay === 1 ? 'One lesson' : `${p.lessonsPerDay} lessons`} {DAY_COUNT(p.studyDays)}
                  {length && ` · ${length.lessons} lessons · ${formatWeeks(length.weeks)}`}
                </p>
                <Link
                  href={`/plan/setup?preset=${p.id}`}
                  className="tactile-btn mt-3 flex min-h-11 items-center justify-center rounded-xl bg-teal text-sm font-semibold text-on-teal"
                >
                  Use this plan
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="rounded-2xl bg-foreground/[0.04] p-4">
          <h2 className="text-base font-bold text-foreground">Keep what you already know</h2>
          <p className="mt-1 text-sm text-muted">No new lessons: a revision schedule for the surahs you&apos;ve memorised, weakest first.</p>
          <Link href="/plan/setup?goal=maintain" className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-card text-sm font-semibold text-foreground">
            Plan my revision
          </Link>
        </div>

        <p className="text-center text-sm text-muted">
          Or <Link href="/plan/setup" className="font-semibold text-teal underline-offset-2 hover:underline">build your own</Link>, and read the{' '}
          <Link href="/blog" className="font-semibold text-teal underline-offset-2 hover:underline">guides</Link> on how the method works.
        </p>
      </main>
    </div>
  );
}
