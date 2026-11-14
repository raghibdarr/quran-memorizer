'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DeckDepth, TextItem } from '@/types/deen';
import { useDeenStore } from '@/stores/deen-store';
import { useDeenQueue } from '@/hooks/use-deen-queue';
import { useAppBack } from '@/hooks/use-app-back';
import CloseButton from '@/components/ui/close-button';
import { SessionPlayer, whenLabel } from '@/components/deen/session-player';
import { MemoriseFlow } from '@/components/deen/memorise-flow';
import { DepthChoice, resolveDepth } from '@/components/deen/depth-choice';
import { getItem, liveDeckInfo, deckTitleOf, type LiveDeck } from '@/components/deen/deck-source';

function Header({ title, fallback, label }: { title: string; fallback: string; label: string }) {
  return (
    <div className="sticky top-[var(--safe-top)] z-10 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
      <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
        <CloseButton fallback={fallback} label={label} className="justify-self-start" />
        <h1 className="truncate text-center text-sm font-semibold text-teal">{title}</h1>
        <span aria-hidden />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent motion-reduce:animate-none" />
    </div>
  );
}

/** ?learn=<deck>:<itemId>[&depth=]: learn one item, full screen */
function LearnScreen({ learn, depthParam }: { learn: string; depthParam: DeckDepth | null }) {
  const [deckId, itemId] = learn.split(':');
  const storedDepth = useDeenStore((s) => s.depth[deckId]);
  const setDepth = useDeenStore((s) => s.setDepth);
  const [state, setState] = useState<{ info: LiveDeck | null; item: TextItem | null; loaded: boolean }>({ info: null, item: null, loaded: false });
  const [chosen, setChosen] = useState<DeckDepth | null>(null);
  const fallback = state.info?.route ?? '/essentials';
  const exit = useAppBack(fallback);

  useEffect(() => {
    let live = true;
    Promise.all([liveDeckInfo(deckId), getItem<TextItem>(deckId, itemId)]).then(([info, item]) => {
      if (live) setState({ info, item: info ? item : null, loaded: true });
    });
    return () => {
      live = false;
    };
  }, [deckId, itemId]);

  const depth = depthParam ?? chosen ?? resolveDepth(storedDepth, state.info?.defaultDepth ?? null);
  const title = state.info?.title ?? 'Learn';

  return (
    <div className="min-h-dvh bg-cream pb-8">
      <Header title={title} fallback={fallback} label="Close" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {!state.loaded ? (
          <Spinner />
        ) : !state.item || !state.info ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-foreground">This text isn&apos;t available</p>
            <button onClick={exit} className="mt-4 min-h-11 text-sm font-semibold text-teal">
              Back
            </button>
          </div>
        ) : !depth ? (
          <DepthChoice
            title={state.info.title}
            onChoose={(d) => {
              setDepth(deckId, d);
              setChosen(d);
            }}
          />
        ) : (
          <MemoriseFlow item={state.item} depth={depth} kind={state.info.kind} onDone={exit} />
        )}
      </main>
    </div>
  );
}

/** The review session over today's queue (all decks, or ?deck=) */
function SessionScreen({ deck, errata }: { deck: string | null; errata: string }) {
  const queue = useDeenQueue(deck);
  const exit = useAppBack('/review');
  // Frozen when the queue is first known: ratings update the store as the session
  // runs, and it must not reshuffle underneath the user
  const [frozen, setFrozen] = useState<string[] | null>(null);
  if (queue.ready && frozen === null) setFrozen(queue.order);
  const title = deck ? deckTitleOf(deck) : 'Hadith, duas and Names';

  return (
    <div className="min-h-dvh bg-cream pb-8">
      <Header title={title} fallback="/review" label="Close review" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {frozen === null ? (
          <Spinner />
        ) : frozen.length > 0 ? (
          <SessionPlayer cardIds={frozen} errata={errata} onExit={exit} />
        ) : (
          <div className="py-16 text-center" data-deen-session="empty">
            <p className="text-sm font-semibold text-foreground">Nothing to review here right now</p>
            <p className="mt-1 text-sm text-muted">
              {queue.nextDue ? `The next card comes back ${whenLabel(queue.nextDue)}.` : 'Cards you learn come back here.'}
            </p>
            <button onClick={exit} className="mt-4 min-h-11 text-sm font-semibold text-teal">
              Back
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * /review/deen (all-in-one spec 2.2): the session player for every deen deck.
 *   ?deck=<id>              one deck's cards
 *   ?learn=<deck>:<item>    learn one item (Read → Build → Recall), then back
 *   &depth=meaning|arabic   with ?learn, skip the depth choice
 */
export default function DeenReviewScreen({ errata }: { errata: string }) {
  const params = useSearchParams();
  const learn = params.get('learn');
  const depthParam = params.get('depth');
  if (learn && learn.includes(':')) {
    return <LearnScreen learn={learn} depthParam={depthParam === 'meaning' || depthParam === 'arabic' ? depthParam : null} />;
  }
  return <SessionScreen deck={params.get('deck')} errata={errata} />;
}
