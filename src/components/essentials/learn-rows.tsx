'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import { GROUP_TITLES, type DeckGroup } from '@/content/deen/registry';
import { useDeenStore } from '@/stores/deen-store';
import { useReviewStore } from '@/stores/review-store';
import type { TextItem } from '@/types/deen';
import { useLiveDecks } from '@/hooks/use-deen-queue';
import { getDeck } from '@/components/deen/deck-source';
import { isRamadan } from '@/lib/hijri/convert';
import { todayIso } from '@/lib/dates';
import { usePrayerStore } from '@/stores/prayer-store';

const GROUP_ORDER: DeckGroup[] = ['hadith', 'adhkar', 'names', 'course'];
const GROUP_ROUTE: Record<DeckGroup, string> = { hadith: '/hadith', adhkar: '/adhkar', names: '/names', course: '/course' };
const GROUP_BLURB: Record<DeckGroup, string> = {
  hadith: 'Short hadith to understand and learn by heart',
  adhkar: 'Remembrance and duas for the day, from the Sunnah',
  names: 'Their meanings, and where each one comes from',
  course: 'Purification and fasting, with where the schools differ',
};

export interface GroupRow {
  group: DeckGroup;
  /**
   * Deck ids in the group, with each deck's item ids. `quran` maps a Quranic
   * item to its first ayah ("2:255"): those get no deen cards, their ayahs
   * join the Quran review.
   */
  decks: { id: string; items: string[]; quran?: Record<string, string> }[];
}

/**
 * Started items and finished lessons, per group. A text is started once it has
 * a card; a Quranic text once its first ayah is in the Quran review (`ayahKeys`,
 * "surah:ayah").
 */
export function groupProgress(
  row: GroupRow,
  cardIds: string[],
  lessonsDone: Record<string, number>,
  ayahKeys: ReadonlySet<string> = new Set(),
): { started: number; total: number } {
  let started = 0;
  let total = 0;
  const startedItems = new Set(cardIds.map((id) => id.split(':').slice(0, 2).join(':')));
  for (const d of row.decks) {
    total += d.items.length;
    for (const item of d.items) {
      const ayah = d.quran?.[item];
      if (row.group === 'course' ? lessonsDone[item] : ayah ? ayahKeys.has(ayah) : startedItems.has(`${d.id}:${item}`)) started++;
    }
  }
  return { started, total };
}

/** The live decks grouped as the Learn tab shows them, with each deck's item ids (null while loading) */
export function useGroupRows(decks: ReturnType<typeof useLiveDecks>): GroupRow[] | null {
  const [rows, setRows] = useState<GroupRow[] | null>(null);

  useEffect(() => {
    if (!decks?.length) return;
    let live = true;
    Promise.all(decks.map(async (d) => ({ d, deck: await getDeck(d.id) }))).then((loaded) => {
      if (!live) return;
      const out: GroupRow[] = [];
      for (const group of GROUP_ORDER) {
        const inGroup = loaded.filter((l) => l.d.group === group);
        if (!inGroup.length) continue;
        out.push({
          group,
          decks: inGroup.map((l) => {
            const items = l.deck?.items ?? [];
            const quran: Record<string, string> = {};
            for (const i of items) {
              const ref = 'quran' in i ? (i as TextItem).quran : undefined;
              if (ref) quran[i.id] = `${ref.surahId}:${ref.ayah}`;
            }
            return { id: l.d.id, items: items.map((i) => i.id), quran };
          }),
        });
      }
      setRows(out);
    }).catch(() => {
      // A deck that fails to load leaves the rows out rather than breaking the tab
    });
    return () => {
      live = false;
    };
  }, [decks]);

  return rows;
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
  const ayahCards = useReviewStore((s) => s.cards);
  const hijriOffset = usePrayerStore((s) => s.hijriOffset);
  // In Ramadan the course row leads with its fasting unit
  const ramadan = useMemo(() => isRamadan(todayIso(), hijriOffset), [hijriOffset]);
  const rows = useGroupRows(decks);

  const cardIds = useMemo(() => Object.keys(cards), [cards]);
  const ayahKeys = useMemo(() => new Set(ayahCards.map((c) => `${c.surahId}:${c.ayahNumber}`)), [ayahCards]);
  // While the decks load, the rows render from the static titles with their
  // counts held invisible, so the plans and guides below don't jump down when
  // the decks arrive
  const loading = decks === null || (decks.length > 0 && rows === null);
  if (!loading && (!decks?.length || !rows?.length)) return null;
  const shown: GroupRow[] = loading ? GROUP_ORDER.map((group) => ({ group, decks: [] })) : rows!;

  return (
    <section aria-labelledby="learn-rows-title" aria-busy={loading || undefined} className="space-y-2" data-learn-rows>
      <h2 id="learn-rows-title" className="px-1 pt-3 text-base font-bold text-foreground">
        Hadith, Names and more
      </h2>
      {shown.map((row) => {
        const { started, total } = groupProgress(row, cardIds, lessonsDone, ayahKeys);
        const unit = row.group === 'course' ? 'lessons' : row.group === 'names' ? 'Names' : 'texts';
        return (
          <Link key={row.group} href={GROUP_ROUTE[row.group]} className="block" data-learn-row={row.group}>
            <Card pressable>
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-foreground">{GROUP_TITLES[row.group]}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {row.group === 'course' && ramadan ? 'Fasting in seven short lessons, for Ramadan; and purification' : GROUP_BLURB[row.group]}
                  </span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              {(total > 0 || loading) && (
                <div className={`mt-3 flex items-center gap-3${loading ? ' invisible' : ''}`} aria-hidden={loading || undefined}>
                  <ProgressBar value={(started / total) * 100} className="flex-1" />
                  {/* Same count format as the collections further down the tab */}
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {started === 0 ? (
                      // Nothing started yet: say what is waiting, not a bare "0/53"
                      <span>
                        {total} to learn
                      </span>
                    ) : (
                      <>
                        <span aria-hidden>
                          {started}/{total}
                        </span>
                        <span className="sr-only">
                          {started} of {total} {unit} started
                        </span>
                      </>
                    )}
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
