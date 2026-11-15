'use client';

import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ITEM_STATE_LABEL, useDeckStates } from '@/components/deen/item-state';
import { sessionHref } from '@/components/deen/links';
import { deckProgress, hadithHref, hadithNumber, NAWAWI_DECK, NAWAWI_TOTAL, progressLine } from './hadith-logic';
import { StateChip } from './state-chip';
import { useHadithDeck } from './use-hadith-deck';

/** al-Nawawi's number in the gold diamond the surah cards on Home use */
function NumberBadge({ n }: { n: number }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden>
      <span className="flex h-7 w-7 rotate-45 items-center justify-center rounded-[8px] border-[1.5px] border-gold/50">
        <span className="-rotate-45 text-xs font-bold tabular-nums text-gold-deep">{n}</span>
      </span>
    </span>
  );
}

/** /hadith: al-Nawawi's Forty, each with where the learner is, and the deck's progress */
export function HadithList() {
  const deck = useHadithDeck();
  const states = useDeckStates(NAWAWI_DECK);

  if (deck.status === 'loading') return <SkeletonRows count={6} />;
  if (deck.status === 'missing') {
    return (
      <div data-hadith-list-failed>
        <Card className="space-y-3 text-center">
          <p className="text-sm text-foreground">The hadith could not be loaded. Try again, or reopen Takrar.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="tactile-btn mx-auto flex min-h-11 items-center justify-center rounded-xl bg-teal px-6 text-sm font-semibold text-on-teal"
          >
            Try again
          </button>
        </Card>
      </div>
    );
  }

  const { items } = deck;
  const progress = deckProgress(items, states);
  const first = items[0];

  return (
    <div className="space-y-5">
      <div data-hadith-progress>
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <ProgressBar value={(progress.started / progress.total) * 100} className="flex-1" />
            <span className="shrink-0 text-xs tabular-nums text-muted">
              <span aria-hidden>
                {progress.started}/{progress.total}
              </span>
              <span className="sr-only">
                {progress.started} of {progress.total} started
              </span>
            </span>
          </div>
          <p className={progress.started === 0 ? 'text-sm font-medium text-foreground' : 'text-sm text-muted'}>{progressLine(progress)}</p>
          {progress.due > 0 && (
            <Link
              href={sessionHref(NAWAWI_DECK)}
              className="tactile-btn flex min-h-11 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-on-teal"
              data-hadith-review
            >
              Review {progress.due === 1 ? '1 hadith' : `${progress.due} hadith`} due today
            </Link>
          )}
          {progress.started === 0 && first && (
            <Link
              href={hadithHref(first.id)}
              className="tactile-btn flex min-h-11 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-on-teal"
              data-hadith-start
            >
              Start with hadith {hadithNumber(first.id)}
            </Link>
          )}
        </Card>
      </div>

      <ol className="space-y-3" aria-label="The hadith">
        {items.map((it) => {
          const state = states[it.id] ?? 'new';
          return (
            <li key={it.id}>
              <Link href={hadithHref(it.id)} className="block" data-hadith-row={it.id}>
                <Card pressable className="flex items-center gap-3 px-5 py-3.5">
                  <NumberBadge n={hadithNumber(it.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">Hadith {hadithNumber(it.id)}: </span>
                    <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{it.title}</span>
                    {it.citations[0]?.narrator && <span className="mt-0.5 block truncate text-xs text-muted">{it.citations[0].narrator}</span>}
                  </span>
                  {/* "Not started" on every row says nothing: it is read out, not shown */}
                  {state === 'new' ? (
                    <span className="sr-only" data-item-state="new">
                      {ITEM_STATE_LABEL.new}
                    </span>
                  ) : (
                    <StateChip state={state} />
                  )}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="-mr-1 shrink-0 text-muted" aria-hidden>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Card>
              </Link>
            </li>
          );
        })}
      </ol>

      {items.length < NAWAWI_TOTAL && (
        <p className="px-1 text-xs leading-relaxed text-muted" data-hadith-pending>
          {items.length} of al-Nawawi&apos;s {NAWAWI_TOTAL} are here so far. The rest are still being checked against their sources, and
          will appear when they pass.{' '}
          <Link href="/sources#method" className="font-semibold text-teal">
            How texts are checked
          </Link>
        </p>
      )}
    </div>
  );
}
