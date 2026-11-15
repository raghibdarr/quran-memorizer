'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import SegmentedControl from '@/components/ui/segmented-control';
import { ChevronDownIcon } from '@/components/ui/icons';
import { CitationLine } from '@/components/deen/citation-line';
import { getDeck } from '@/components/deen/deck-source';
import { sessionHref } from '@/components/deen/links';
import { ITEM_STATE_LABEL, useDeckStates } from '@/components/deen/item-state';
import { DEPTH_LABEL } from '@/components/deen/depth-choice';
import { useDeenStore } from '@/stores/deen-store';
import { useDayClock } from '@/hooks/use-day-clock';
import { startOfDayMs } from '@/lib/dates';
import { getSurahIndex } from '@/lib/quran-data';
import { navTransitionTypes } from '@/lib/nav';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import type { DeckDepth, NameItem } from '@/types/deen';
import { NameSheet } from './name-sheet';
import { StateMark } from './state-mark';
import { withHonorific } from './honorific';
import { INTRO_CITATIONS, INTRO_PARAGRAPHS, INTRO_SOURCES, INTRO_TITLE } from './names-intro';
import {
  NAMES_DECK,
  batchSize,
  cardsForNames,
  depthChange,
  learnStatus,
  namesReadiness,
  namesStartedSince,
  nextNames,
  plainName,
  sortNames,
  startedNameIds,
  unseenNameCards,
} from './names-logic';

/** Words in a Name's Arabic: two-word Names take a smaller size, longer ones a double-width tile, so the Arabic stays on one line */
const arabicWords = (it: NameItem) => it.arabic.trim().split(' ').length;

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
    <section className="rounded-xl bg-foreground/[0.04]" data-names-intro>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="names-intro-body"
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{INTRO_TITLE}</span>
          {!open && <span className="mt-0.5 block text-xs text-muted">The number is in al-Bukhari and Muslim. The list comes from one narration.</span>}
        </span>
        <ChevronDownIcon size={16} className={cn('shrink-0 text-muted transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open && (
        <div id="names-intro-body" className="space-y-4 px-4 pb-4">
          {INTRO_PARAGRAPHS.map((p) => (
            <p key={p.slice(0, 24)} className="text-[15px] leading-7 text-foreground">
              {withHonorific(p)}
            </p>
          ))}
          <div className="space-y-2.5 border-t border-foreground/10 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Sources</p>
            {INTRO_CITATIONS.map((c) => (
              <CitationLine key={`${c.collection}-${c.number}`} citation={c} className="[&>div]:flex-col [&>div]:items-start [&>div]:gap-0" />
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
  const router = useRouter();
  const [items, setItems] = useState<NameItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // The sheet keeps its Name while it slides shut
  const [sheetOpen, setSheetOpen] = useState(false);
  const [surahNames, setSurahNames] = useState<Record<number, string>>();
  const cards = useDeenStore((s) => s.cards);
  const storedDepth = useDeenStore((s) => s.depth[NAMES_DECK]);
  const newPerDay = useDeenStore((s) => s.newPerDay);
  const introduced = useDeenStore((s) => s.introduced);
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
  const { ready, waiting } = useMemo(() => namesReadiness({ cards, newPerDay, introduced }, dayEnd), [cards, newPerDay, introduced, dayEnd]);
  const unseen = useMemo(() => unseenNameCards(cards), [cards]);
  const size = batchSize(newPerDay);
  const next = useMemo(() => (items ? nextNames(items, cards, size) : []), [items, cards, size]);
  const startedCount = items ? items.filter((it) => started.has(it.id)).length : 0;
  const openIndex = items && openId ? items.findIndex((it) => it.id === openId) : -1;
  const openItem = openIndex >= 0 ? items![openIndex] : null;

  const learn = (list: NameItem[]) => {
    if (!list.length) return;
    addCards(cardsForNames(list, depth));
    haptic.selection();
  };

  /** The main button: bring in the next Names and go straight to them when the session has them */
  const learnAndGo = (list: NameItem[]) => {
    learn(list);
    const s = useDeenStore.getState();
    if (namesReadiness(s, dayEnd).ready === 0) return;
    const href = sessionHref(NAMES_DECK);
    router.push(href, { transitionTypes: navTransitionTypes('/names', href) });
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

  const step = (by: -1 | 1) => {
    const it = items?.[openIndex + by];
    if (it) setOpenId(it.id);
  };

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <Header />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
        <p className="text-[15px] leading-relaxed text-foreground">The ninety-nine Names in the order most people learn them, with what each one means and where it comes from.</p>

        <IntroCard />

        {failed ? (
          <p className="py-10 text-center text-sm text-muted">The Names couldn&apos;t load. Check your connection and open this page again.</p>
        ) : !items ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : (
          <>
            <section className="tactile-card space-y-4 rounded-2xl bg-card p-4 min-[400px]:p-5" data-names-learn>
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
                  className="[&>button]:px-1 [&>button]:text-[13px] [&>button]:tracking-tight"
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
              ) : today > 0 || ready > 0 || waiting > 0 ? (
                <div className="space-y-2">
                  <p className="pb-1 text-sm text-foreground" data-names-today={today} data-names-ready={ready} data-names-waiting={waiting}>
                    {learnStatus({ today, ready, waiting })}
                  </p>
                  {ready > 0 && (
                    <Link href={sessionHref(NAMES_DECK)} className="tactile-btn flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-6 font-semibold text-on-teal hover:bg-teal-light" data-names-review>
                      Review them now
                    </Link>
                  )}
                  {/* More Names only once every Name in hand has been seen in a session */}
                  {unseen === 0 && (
                    <button
                      type="button"
                      onClick={() => learn(next)}
                      className="mx-auto -mb-2 flex min-h-11 items-center px-3 text-sm font-semibold text-teal hover:text-teal-light"
                      data-names-more
                    >
                      {today > 0 ? `Add ${next.length} more` : `Learn the next ${next.length}`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    {startedCount === 0 ? 'Start with ' : 'Next: '}
                    <span className="font-semibold">{next.map((n) => plainName(n.transliteration)).join(', ')}</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => learnAndGo(next)}
                    className="tactile-btn flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-6 font-semibold text-on-teal hover:bg-teal-light"
                    data-names-start
                  >
                    {startedCount === 0 ? 'Start learning' : `Learn the next ${next.length}`}
                  </button>
                </div>
              )}
            </section>

            {startedCount > 0 && (
              <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Key" data-names-key>
                {(['learning', 'due', 'strong'] as const).map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <StateMark state={s} />
                    {ITEM_STATE_LABEL[s]}
                  </li>
                ))}
              </ul>
            )}

            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-names-grid aria-label="The ninety-nine Names">
              {items.map((it) => {
                const state = states[it.id] ?? 'new';
                const listOnly = it.evidence.kind === 'list-only';
                const words = arabicWords(it);
                return (
                  <li key={it.id} className={cn(words > 2 && 'col-span-2')}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(it.id);
                        setSheetOpen(true);
                      }}
                      className="pressable relative flex h-full min-h-[7.25rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-foreground/10 bg-card px-1.5 pb-3 pt-5 text-center hover:border-foreground/25"
                      data-name-tile={it.id}
                      data-state={state}
                      aria-label={`${it.order}. ${plainName(it.transliteration)}, ${it.meaning}. ${listOnly ? 'Found in the list only. ' : ''}${ITEM_STATE_LABEL[state]}`}
                    >
                      <span className="absolute left-2.5 top-2 text-[11px] font-medium leading-none tabular-nums text-muted">{it.order}</span>
                      <StateMark state={state} className="absolute right-2.5 top-2" />
                      {listOnly && (
                        <span className="absolute left-1/2 top-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold/15 px-1 text-[9px] font-semibold leading-[14px] text-gold-deep" data-list-only>
                          List only
                        </span>
                      )}
                      <span
                        className={cn('arabic-text flex h-[2.2em] items-center whitespace-nowrap leading-[2.2]! text-teal', words === 2 ? 'text-[1.1rem]' : 'text-[1.4rem]')}
                        lang="ar"
                        dir="rtl"
                      >
                        {it.arabic}
                      </span>
                      <span className="line-clamp-2 w-full break-words text-[11px] font-semibold leading-tight text-foreground">{plainName(it.transliteration)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>

      <NameSheet
        item={openItem}
        state={openItem ? (states[openItem.id] ?? 'new') : 'new'}
        open={sheetOpen && !!openItem}
        onClose={() => setSheetOpen(false)}
        onLearn={(it) => learn([it])}
        surahNames={surahNames}
        onPrev={openIndex > 0 ? () => step(-1) : undefined}
        onNext={items && openIndex >= 0 && openIndex < items.length - 1 ? () => step(1) : undefined}
      />
      <BottomNav />
    </div>
  );
}
