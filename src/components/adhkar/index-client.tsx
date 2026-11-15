'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import BottomNav from '@/components/layout/bottom-nav';
import ScreenHeader from '@/components/worship/screen-header';
import { getDeck, type LiveDeck } from '@/components/deen/deck-source';
import { deckStatesOf } from '@/components/deen/item-state';
import { useDeenStore } from '@/stores/deen-store';
import { useDayClock } from '@/hooks/use-day-clock';
import type { TextItem } from '@/types/deen';
import { cn } from '@/lib/cn';
import { ADHKAR_SETS, SET_IDS, nowHref, stepsFor, type SetId } from './sets';
import { useAdhkarDecks } from './use-deck';
import { useEssentialsMigration } from './use-migration';
import ReminderSwitches from './reminder-switches';

const SET_HINT: Record<SetId, string> = {
  morning: 'From Fajr to sunrise',
  evening: 'From Asr to Maghrib',
  'after-prayer': 'Once the prayer ends',
  sleep: 'At bedtime',
};

/** Every live adhkar deck's shipped items, loaded together (they are small) */
function useDeckItems(decks: LiveDeck[] | null): Record<string, TextItem[]> | null {
  const [items, setItems] = useState<{ key: string; value: Record<string, TextItem[]> } | null>(null);
  const key = decks?.map((d) => d.id).join(',') ?? '';
  useEffect(() => {
    if (!decks) return;
    let live = true;
    Promise.all(decks.map((d) => getDeck(d.id).then((deck) => [d.id, (deck?.items ?? []) as TextItem[]] as const)))
      .then((pairs) => live && setItems({ key, value: Object.fromEntries(pairs) }))
      .catch(() => live && setItems({ key, value: {} }));
    return () => {
      live = false;
    };
    // key stands for decks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return items && items.key === key ? items.value : null;
}

/** /adhkar (spec 2.2): say a set now, learn the decks, and the optional reminders */
export default function AdhkarIndexClient() {
  useEssentialsMigration();
  const decks = useAdhkarDecks();
  const items = useDeckItems(decks);
  const cards = useDeenStore((s) => s.cards);
  const dayEnd = useDayClock();

  const progress = useMemo(() => {
    const out: Record<string, { started: number; strong: number; total: number }> = {};
    for (const d of decks ?? []) {
      const list = items?.[d.id] ?? [];
      const states = deckStatesOf(cards, d.id, dayEnd);
      const ids = new Set(list.map((i) => i.id));
      const mine = Object.entries(states).filter(([id]) => ids.has(id));
      out[d.id] = { total: list.length, started: mine.length, strong: mine.filter(([, s]) => s === 'strong').length };
    }
    return out;
  }, [decks, items, cards, dayEnd]);

  const sets = SET_IDS.map((id) => ADHKAR_SETS[id])
    .map((s) => ({ set: s, steps: items?.[s.deck] ? stepsFor(s, items[s.deck]).length : 0 }))
    .filter((s) => s.steps > 0);

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-adhkar-index>
      <ScreenHeader title="Adhkar and duas" back="/essentials" />
      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4">
        <p className="px-1 text-sm leading-relaxed text-muted">Remembrance and duas from the Sunnah, each with its source. Say a set now, or learn them by heart.</p>

        {decks === null || items === null ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-28 rounded-2xl border border-foreground/10 bg-card" />
            <div className="h-48 rounded-2xl border border-foreground/10 bg-card" />
          </div>
        ) : decks.length === 0 ? (
          <p className="rounded-2xl border border-foreground/10 bg-card px-5 py-8 text-center text-sm text-muted">The adhkar are still being checked. They will appear here once they pass.</p>
        ) : (
          <>
            {sets.length > 0 && (
              <section aria-labelledby="adhkar-say-now" className="space-y-2">
                <h2 id="adhkar-say-now" className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  Say them now
                </h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {sets.map(({ set, steps }) => (
                    <Link
                      key={set.id}
                      href={nowHref(set.id)}
                      className="pressable flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-foreground/10 bg-card p-3.5 hover:bg-foreground/[0.02]"
                      data-set-link={set.id}
                    >
                      <span className="text-[15px] font-semibold text-foreground">{set.title}</span>
                      <span className="text-xs text-muted">
                        {SET_HINT[set.id]} · {steps}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="adhkar-learn" className="space-y-2">
              <h2 id="adhkar-learn" className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Learn by heart
              </h2>
              <ul className="divide-y divide-foreground/10 overflow-hidden rounded-2xl border border-foreground/10 bg-card">
                {decks.map((d) => {
                  const p = progress[d.id] ?? { started: 0, strong: 0, total: 0 };
                  const pct = p.total ? Math.round((p.started / p.total) * 100) : 0;
                  return (
                    <li key={d.id}>
                      <Link href={`/adhkar/view?d=${d.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-foreground/[0.02]" data-deck-link={d.id}>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-foreground">{d.title}</span>
                          <span className="block truncate text-xs text-muted">{d.blurb}</span>
                          <span className="mt-1.5 flex items-center gap-2">
                            <span className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                              <span className={cn('block h-full rounded-full bg-teal')} style={{ width: `${pct}%` }} />
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted" data-deck-progress={`${p.started}/${p.total}`}>
                              {p.started ? `${p.started} of ${p.total} learning` : `${p.total} to learn`}
                            </span>
                          </span>
                        </span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="adhkar-reminders" className="space-y-2">
              <h2 id="adhkar-reminders" className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Reminders
              </h2>
              <ReminderSwitches />
            </section>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
