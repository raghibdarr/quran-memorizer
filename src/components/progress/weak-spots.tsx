'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import type { ReviewCard, SurahMeta } from '@/types/quran';
import { getSurahIndex } from '@/lib/quran-data';
import { getWeakSpots } from '@/lib/retention';
import { MISS_LOG_SIZE } from '@/lib/spaced-repetition';
import Card from '@/components/ui/card';

const DAY = 864e5;
const ago = (ms: number) => {
  const d = Math.floor((Date.now() - ms) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : `${Math.floor(d / 30)} mo ago`;
};

/**
 * Recurring weak spots (M10): the ayahs that keep slipping over time, from each
 * card's failure history, and a way into drilling them.
 */
export default function WeakSpots({ cards }: { cards: ReviewCard[] }) {
  const spots = useMemo(() => getWeakSpots(cards, 8), [cards]);
  const [names, setNames] = useState<Map<number, SurahMeta>>(new Map());
  useEffect(() => {
    if (spots.length) getSurahIndex().then((idx) => setNames(new Map(idx.map((s) => [s.id, s]))));
  }, [spots.length]);

  if (spots.length === 0) return null;
  return (
    <Card className="hover:brightness-100 dark:hover:brightness-100">
      <p className="text-sm font-bold text-foreground">Recurring weak spots</p>
      <p className="mt-0.5 text-xs text-muted">Ayahs that have slipped more than once. Most slips first.</p>
      <ul className="mt-3 divide-y divide-foreground/5">
        {spots.map((c) => {
          const last = c.misses?.[c.misses.length - 1];
          const dots = Math.min(c.lapses ?? 0, MISS_LOG_SIZE);
          return (
            <li key={`${c.surahId}:${c.ayahNumber}`} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {names.get(c.surahId)?.nameSimple ?? `Surah ${c.surahId}`} <span className="text-muted">· ayah {c.ayahNumber}</span>
                </span>
                <span className="block text-xs text-muted">
                  Slipped {c.lapses}×{last ? `, most recently ${ago(last)}` : ''}
                  {(c.failStreak ?? 0) === 0 && (c.lastQuality ?? 0) >= 4 && <span className="text-success"> · fine last time</span>}
                </span>
              </span>
              <span className="flex shrink-0 gap-0.5" aria-hidden>
                {Array.from({ length: dots }, (_, i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-miss/70" />)}
              </span>
            </li>
          );
        })}
      </ul>
      <Link href="/review/drill" className="tactile-btn mt-3 flex min-h-11 items-center justify-center rounded-xl bg-teal/10 text-sm font-semibold text-teal">
        Drill your weakest ayahs
      </Link>
    </Card>
  );
}
