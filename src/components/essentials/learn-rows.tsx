'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import { GROUP_TITLES, type DeckGroup } from '@/content/deen/registry';
import { useDeenStore } from '@/stores/deen-store';
import { useLiveDecks } from '@/hooks/use-deen-queue';
import { getDeck } from '@/components/deen/deck-source';

const GROUP_ORDER: DeckGroup[] = ['hadith', 'adhkar', 'names', 'course'];
const GROUP_ROUTE: Record<DeckGroup, string> = { hadith: '/hadith', adhkar: '/adhkar', names: '/names', course: '/course' };
const GROUP_BLURB: Record<DeckGroup, string> = {
  hadith: 'Short hadith to understand and learn by heart',
  adhkar: 'Remembrance and duas for the day, from the Sunnah',
  names: 'Their meanings, and where each one comes from',
  course: 'Purification and fasting, with where the schools differ',
};

interface GroupRow {
  group: DeckGroup;
  /** Deck ids in the group, with each deck's item ids */
  decks: { id: string; items: string[] }[];
}

/** Started items (any card) and finished lessons, per group */
export function groupProgress(row: GroupRow, cardIds: string[], lessonsDone: Record<string, number>): { started: number; total: number } {
  let started = 0;
  let total = 0;
  const startedItems = new Set(cardIds.map((id) => id.split(':').slice(0, 2).join(':')));
  for (const d of row.decks) {
    total += d.items.length;
    for (const item of d.items) {
      if (row.group === 'course' ? lessonsDone[item] : startedItems.has(`${d.id}:${item}`)) started++;
    }
  }
  return { started, total };
}

/**
 * Slot (all-in-one spec 2.4, 3.4) at the top of the Learn tab: registry-driven
 * rows for Hadith, Adhkar and duas, Names of Allah and the course; decks with
 * `ready: false` are hidden, and nothing renders until one is ready. Owner:
 * deen-engine.
 */
export function LearnRows() {
  const decks = useLiveDecks();
  const cards = useDeenStore((s) => s.cards);
  const lessonsDone = useDeenStore((s) => s.lessonsDone);
  const [rows, setRows] = useState<GroupRow[] | null>(null);

  useEffect(() => {
    if (!decks?.length) return;
    let live = true;
    Promise.all(decks.map(async (d) => ({ d, deck: await getDeck(d.id) }))).then((loaded) => {
      if (!live) return;
      const out: GroupRow[] = [];
      for (const group of GROUP_ORDER) {
        const inGroup = loaded.filter((l) => l.d.group === group);
        if (inGroup.length) out.push({ group, decks: inGroup.map((l) => ({ id: l.d.id, items: (l.deck?.items ?? []).map((i) => i.id) })) });
      }
      setRows(out);
    });
    return () => {
      live = false;
    };
  }, [decks]);

  const cardIds = useMemo(() => Object.keys(cards), [cards]);
  if (!decks?.length || !rows?.length) return null;

  return (
    <section aria-labelledby="learn-rows-title" className="space-y-2" data-learn-rows>
      <h2 id="learn-rows-title" className="px-1 pt-3 text-base font-bold text-foreground">
        Hadith, Names and more
      </h2>
      {rows.map((row) => {
        const { started, total } = groupProgress(row, cardIds, lessonsDone);
        const unit = row.group === 'course' ? 'lessons' : row.group === 'names' ? 'Names' : 'texts';
        return (
          <Link key={row.group} href={GROUP_ROUTE[row.group]} className="block" data-learn-row={row.group}>
            <Card pressable>
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-foreground">{GROUP_TITLES[row.group]}</span>
                  <span className="mt-0.5 block text-xs text-muted">{GROUP_BLURB[row.group]}</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              {total > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar value={(started / total) * 100} className="flex-1" />
                  {/* Same count format as the collections further down the tab */}
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    <span aria-hidden>
                      {started}/{total}
                    </span>
                    <span className="sr-only">
                      {started} of {total} {unit} started
                    </span>
                  </span>
                </div>
              )}
            </Card>
          </Link>
        );
      })}
      <p className="flex flex-wrap gap-x-4 px-1 pt-1 text-xs">
        <Link href="/glossary" className="inline-flex min-h-9 items-center font-semibold text-teal">
          Glossary of terms
        </Link>
        <Link href="/sources" className="inline-flex min-h-9 items-center font-semibold text-teal">
          Sources and method
        </Link>
      </p>
    </section>
  );
}

export default LearnRows;
