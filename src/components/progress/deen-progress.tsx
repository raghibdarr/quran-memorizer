'use client';

import { useMemo } from 'react';
import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import { GROUP_TITLES } from '@/content/deen/registry';
import { useDeenStore } from '@/stores/deen-store';
import { useReviewStore } from '@/stores/review-store';
import { useLiveDecks } from '@/hooks/use-deen-queue';
import { groupProgress, useGroupRows } from '@/components/essentials/learn-rows';

/**
 * Progress beyond the Quran, under the Quran summary: how far into each deck
 * and the course, then the prayer and fasting logs. Counts of what was started,
 * never of anything missed.
 */
export default function DeenProgress() {
  const decks = useLiveDecks();
  const rows = useGroupRows(decks);
  const cards = useDeenStore((s) => s.cards);
  const lessonsDone = useDeenStore((s) => s.lessonsDone);
  const ayahCards = useReviewStore((s) => s.cards);
  const cardIds = useMemo(() => Object.keys(cards), [cards]);
  const ayahKeys = useMemo(() => new Set(ayahCards.map((c) => `${c.surahId}:${c.ayahNumber}`)), [ayahCards]);

  return (
    <section aria-labelledby="deen-progress-title" className="space-y-2" data-deen-progress>
      <h2 id="deen-progress-title" className="px-1 pt-2 text-base font-bold text-foreground">
        Hadith, duas, Names and lessons
      </h2>
      {rows && rows.length > 0 && (
        <Card className="py-1">
          <ul className="divide-y divide-foreground/10">
            {rows.map((row) => {
              const { started, total } = groupProgress(row, cardIds, lessonsDone, ayahKeys);
              const unit = row.group === 'course' ? 'lessons done' : 'started';
              return (
                <li key={row.group} className="flex min-h-11 items-center justify-between gap-3 text-sm" data-deen-progress-row={row.group}>
                  <span className="min-w-0 truncate font-semibold text-foreground">{GROUP_TITLES[row.group]}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {started} of {total} {unit}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/prayer/tracker" className="pressable flex min-h-12 items-center justify-between rounded-xl border border-teal/20 bg-teal/5 px-4 py-2.5 text-sm" data-prayer-log-link>
          <span className="font-semibold text-teal">Prayer log</span>
          <span aria-hidden className="text-teal">›</span>
        </Link>
        <Link href="/ramadan" className="pressable flex min-h-12 items-center justify-between rounded-xl border border-teal/20 bg-teal/5 px-4 py-2.5 text-sm" data-fasting-log-link>
          <span className="font-semibold text-teal">Fasting log</span>
          <span aria-hidden className="text-teal">›</span>
        </Link>
      </div>
    </section>
  );
}
