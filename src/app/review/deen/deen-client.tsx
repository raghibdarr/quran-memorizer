'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DeckDepth, TextItem } from '@/types/deen';
import { useDeenStore } from '@/stores/deen-store';
import { useDeenQueue } from '@/hooks/use-deen-queue';
import { useAppBack } from '@/hooks/use-app-back';
import CloseButton from '@/components/ui/close-button';
import Button from '@/components/ui/button';
import { BookIcon, StarIcon } from '@/components/ui/icons';
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

/** A calm, centred message with its icon, for empty and unavailable screens */
function Message({ icon, title, children, onBack, data }: { icon: ReactNode; title: string; children?: ReactNode; onBack: () => void; data?: string }) {
  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center text-center" data-deen-session={data}>
      <div className="w-full max-w-sm space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal/10 text-teal">{icon}</div>
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          {children && <p className="mt-1.5 text-sm text-muted">{children}</p>}
        </div>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
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
      // Only texts (hadith, dhikr and duas) are learned here: Names and lessons have their own screens
      const text = info && (info.kind === 'hadith' || info.kind === 'dhikr') ? item : null;
      if (live) setState({ info, item: text, loaded: true });
    }).catch(() => {
      if (live) setState({ info: null, item: null, loaded: true });
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
          <Message icon={<BookIcon size={24} />} title="This text isn't available" onBack={exit} />
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
          <Message icon={<StarIcon size={24} />} title="Nothing to review here right now" onBack={exit} data="empty">
            {queue.dueTotal > 0
              ? 'That is today’s reviews done. The rest wait for tomorrow.'
              : queue.nextDue
                ? `The next card comes back ${whenLabel(queue.nextDue)}.`
                : 'Cards you learn come back here.'}
          </Message>
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
