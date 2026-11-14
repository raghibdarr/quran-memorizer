'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import SegmentedControl from '@/components/ui/segmented-control';
import { ChevronDownIcon } from '@/components/ui/icons';
import { CitationLine } from '@/components/deen/citation-line';
import { getDeck } from '@/components/deen/deck-source';
import { sessionHref } from '@/components/deen/links';
import { useDeckStates, type ItemState } from '@/components/deen/item-state';
import { DEPTH_LABEL } from '@/components/deen/depth-choice';
import { useDeenStore } from '@/stores/deen-store';
import { useDayClock } from '@/hooks/use-day-clock';
import { startOfDayMs } from '@/lib/dates';
import { getSurahIndex } from '@/lib/quran-data';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import type { DeckDepth, NameItem } from '@/types/deen';
import { NameSheet } from './name-sheet';
import { INTRO_CITATIONS, INTRO_PARAGRAPHS, INTRO_SOURCES, INTRO_TITLE } from './names-intro';
import {
  NAMES_DECK,
  batchSize,
  cardsForNames,
  depthChange,
  namesStartedSince,
  nextNames,
  sortNames,
  startedNameIds,
} from './names-logic';

const STATE_DOT: Record<ItemState, string> = {
  new: 'bg-transparent',
  learning: 'bg-gold',
  due: 'bg-teal',
  strong: 'bg-success',
};

function Header() {
  return (
    <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
      <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
        <BackButton fallback="/essentials" className="justify-self-start" />
        <h1 className="truncate text-center text-sm font-semibold text-teal">Names of Allah</h1>
        <span aria-hidden />
      </div>
    </div>
  );
}

/** Where the list comes from (spec 6): folded to one line until opened */
function IntroCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-foreground/10 bg-card" data-names-intro>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{INTRO_TITLE}</span>
          {!open && <span className="mt-0.5 block text-xs text-muted">The number is in al-Bukhari and Muslim. The list comes from one narration.</span>}
        </span>
        <ChevronDownIcon size={16} className={cn('shrink-0 text-muted transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {INTRO_PARAGRAPHS.map((p) => (
            <p key={p.slice(0, 24)} className="text-sm leading-relaxed text-foreground">
              {p}
            </p>
          ))}
          <div className="space-y-1 border-t border-foreground/10 pt-3">
            {INTRO_CITATIONS.map((c) => (
              <CitationLine key={`${c.collection}-${c.number}`} citation={c} />
            ))}
            {INTRO_SOURCES.map((s) => (
              <p key={s.who} className="text-[13px] leading-relaxed text-muted">
                <span className="font-semibold text-foreground">{s.who}</span>, {s.work}, {s.location}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * /names (all-in-one spec 2.2): the intro card, the learning card (start, depth,
 * progress), and every Name in list order with where the learner is with it.
 */
export default function NamesScreen() {
  const [items, setItems] = useState<NameItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [surahNames, setSurahNames] = useState<Record<number, string>>();
  const cards = useDeenStore((s) => s.cards);
  const storedDepth = useDeenStore((s) => s.depth[NAMES_DECK]);
  const newPerDay = useDeenStore((s) => s.newPerDay);
  const addCards = useDeenStore((s) => s.addCards);
  const setDepth = useDeenStore((s) => s.setDepth);
  const setSuspended = useDeenStore((s) => s.setSuspended);
  const states = useDeckStates(NAMES_DECK);
  const dayEnd = useDayClock();
  const depth: DeckDepth = storedDepth ?? 'meaning';

  useEffect(() => {
    let live = true;
    getDeck(NAMES_DECK)
      .then((d) => {
        if (!live) return;
        if (d) setItems(sortNames(d.items));
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    getSurahIndex()
      .then((list) => live && setSurahNames(Object.fromEntries(list.map((s) => [s.id, s.nameSimple]))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const started = useMemo(() => startedNameIds(cards), [cards]);
  const today = useMemo(() => namesStartedSince(cards, startOfDayMs(dayEnd)), [cards, dayEnd]);
  const size = batchSize(newPerDay);
  const next = useMemo(() => (items ? nextNames(items, cards, size) : []), [items, cards, size]);
  const startedCount = items ? items.filter((it) => started.has(it.id)).length : 0;
  const openItem = items?.find((it) => it.id === openId) ?? null;

  const learn = (list: NameItem[]) => {
    if (!list.length) return;
    addCards(cardsForNames(list, depth));
    haptic.selection();
  };

  const chooseDepth = (d: DeckDepth) => {
    if (d === depth) return;
    setDepth(NAMES_DECK, d);
    if (!items) return;
    const change = depthChange(useDeenStore.getState().cards, items, d);
    if (Object.keys(change.add).length) addCards(change.add);
    for (const id of change.suspend) setSuspended(id, true);
    for (const id of change.resume) setSuspended(id, false);
  };

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <Header />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
        <p className="text-sm leading-relaxed text-muted">The ninety-nine Names in the order most people learn them, with what each one means and where it comes from.</p>

        <IntroCard />

        {failed ? (
          <p className="py-10 text-center text-sm text-muted">The Names couldn&apos;t load. Check your connection and open this page again.</p>
        ) : !items ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : (
          <>
            <section className="tactile-card space-y-4 rounded-2xl bg-card p-5" data-names-learn>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold text-foreground">Learn the Names</h2>
                <span className="text-xs tabular-nums text-muted" data-names-started={startedCount}>
                  {startedCount} of {items.length} started
                </span>
              </div>
              <div className="space-y-1.5">
                <SegmentedControl<DeckDepth>
                  options={[
                    { value: 'meaning', label: DEPTH_LABEL.meaning.title },
                    { value: 'arabic', label: DEPTH_LABEL.arabic.title },
                  ]}
                  value={depth}
                  onChange={chooseDepth}
                />
                <p className="text-xs leading-relaxed text-muted">
                  {depth === 'meaning'
                    ? 'You see each Name and recall what it means.'
                    : 'You also see the meaning and recall the Name.'}
                </p>
              </div>
              {next.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">You have started all {items.length} Names. They come back in your reviews.</p>
                  <Link href={sessionHref(NAMES_DECK)} className="tactile-btn flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-6 font-semibold text-on-teal hover:bg-teal-light">
                    Review the Names
                  </Link>
                </div>
              ) : today > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-foreground" data-names-today={today}>
                    {today === 1 ? '1 new Name' : `${today} new Names`} today. They are waiting in your reviews.
                  </p>
                  <Link href={sessionHref(NAMES_DECK)} className="tactile-btn flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-6 font-semibold text-on-teal hover:bg-teal-light" data-names-review>
                    Review them now
                  </Link>
                  <button type="button" onClick={() => learn(next)} className="mx-auto block min-h-11 text-sm font-semibold text-muted hover:text-foreground">
                    Add {next.length} more
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    {startedCount === 0 ? 'Start with ' : 'Next: '}
                    <span className="font-semibold">{next.map((n) => n.transliteration).join(', ')}</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => learn(next)}
                    className="tactile-btn flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-6 font-semibold text-on-teal hover:bg-teal-light"
                    data-names-start
                  >
                    {startedCount === 0 ? 'Start learning' : `Learn the next ${next.length}`}
                  </button>
                </div>
              )}
            </section>

            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-names-grid aria-label="The ninety-nine Names">
              {items.map((it) => {
                const state = states[it.id] ?? 'new';
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(it.id)}
                      className="pressable relative flex h-full min-h-[6.5rem] w-full flex-col items-center justify-between gap-1 rounded-2xl border border-foreground/10 bg-card px-1.5 pb-2 pt-2.5 text-center hover:border-foreground/25"
                      data-name-tile={it.id}
                      data-state={state}
                      aria-label={`${it.order}. ${it.transliteration}, ${it.meaning}. ${state === 'new' ? 'Not started' : state}`}
                    >
                      <span className="absolute left-2 top-1.5 text-[10px] tabular-nums text-muted">{it.order}</span>
                      <span aria-hidden className={cn('absolute right-2 top-2 h-1.5 w-1.5 rounded-full', STATE_DOT[state], state === 'new' && 'border border-foreground/20')} />
                      <span className="arabic-text mt-1 text-[1.35rem] leading-snug text-teal" lang="ar" dir="rtl">
                        {it.arabic}
                      </span>
                      <span className="w-full truncate text-[11px] font-semibold text-foreground">{it.transliteration}</span>
                      {it.evidence.kind === 'list-only' && (
                        <span className="rounded-full bg-gold/15 px-1.5 text-[10px] font-semibold text-gold-deep" data-list-only>
                          List only
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Key">
              {(['learning', 'due', 'strong'] as const).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', STATE_DOT[s])} />
                  {s === 'learning' ? 'Learning' : s === 'due' ? 'Due today' : 'Strong'}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <NameSheet
        item={openItem}
        state={openItem ? (states[openItem.id] ?? 'new') : 'new'}
        open={!!openItem}
        onClose={() => setOpenId(null)}
        onLearn={(it) => learn([it])}
        surahNames={surahNames}
      />
      <BottomNav />
    </div>
  );
}
