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
import Card from '@/components/ui/card';
import { MoonIcon, PrayerIcon } from '@/components/ui/icons';
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

/** The sun on the horizon, rising (morning) or setting (evening), on the ui/icons grid */
function HorizonIcon({ rising, size = 18 }: { rising: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 18a5 5 0 0 0-10 0" />
      <path d="M2 22h20" />
      <path d="M4.2 13.2l1.4 1.4M1 18h2M21 18h2M18.4 14.6l1.4-1.4" />
      {rising ? <path d="M12 2v6M9 5l3-3 3 3" /> : <path d="M12 8V2M9 5l3 3 3-3" />}
    </svg>
  );
}

const SET_ICON: Record<SetId, React.ReactNode> = {
  morning: <HorizonIcon rising />,
  evening: <HorizonIcon rising={false} />,
  'after-prayer': <PrayerIcon size={18} />,
  sleep: <MoonIcon size={18} />,
};

function SectionHead({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="px-1 text-base font-bold text-foreground">
      {children}
    </h2>
  );
}

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
      <main className="mx-auto max-w-2xl space-y-7 px-4 pt-4">
        <p className="max-w-prose px-1 text-[13px] leading-relaxed text-muted">Remembrance and duas from the Sunnah, each with its source. Say a set now, or learn them by heart.</p>

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
              <section aria-labelledby="adhkar-say-now" className="space-y-3">
                <SectionHead id="adhkar-say-now">Say them now</SectionHead>
                <div className="grid grid-cols-2 gap-3">
                  {sets.map(({ set, steps }) => (
                    <Link key={set.id} href={nowHref(set.id)} className="block" data-set-link={set.id}>
                      <Card pressable className="flex h-full flex-col p-4">
                        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-teal/10 text-teal">{SET_ICON[set.id]}</span>
                        <span className="text-sm font-semibold text-foreground">{set.title}</span>
                        <span className="mt-0.5 text-xs text-muted">{SET_HINT[set.id]}</span>
                        <span className="mt-auto pt-2 text-[11px] tabular-nums text-muted">{steps} adhkar</span>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="adhkar-learn" className="space-y-3">
              <SectionHead id="adhkar-learn">Learn by heart</SectionHead>
              <ul className="divide-y divide-foreground/10 overflow-hidden rounded-2xl border border-foreground/10 bg-card">
                {decks.map((d) => {
                  const p = progress[d.id] ?? { started: 0, strong: 0, total: 0 };
                  const pct = p.total ? Math.round((p.started / p.total) * 100) : 0;
                  return (
                    <li key={d.id}>
                      <Link href={`/adhkar/view?d=${d.id}`} className="pressable flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-foreground/[0.02]" data-deck-link={d.id}>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="text-[15px] font-semibold text-foreground">{d.title}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted" data-deck-progress={`${p.started}/${p.total}`}>
                              {p.started ? `${p.started} of ${p.total} learning` : `${p.total} to learn`}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">{d.blurb}</span>
                          {/* The bar only once something is started: five empty bars say nothing */}
                          {p.started > 0 && (
                            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                              <span className="block h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
                            </span>
                          )}
                        </span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-1 shrink-0 self-start text-muted" aria-hidden>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="adhkar-reminders" className="space-y-3">
              <SectionHead id="adhkar-reminders">Reminders</SectionHead>
              <ReminderSwitches />
            </section>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
