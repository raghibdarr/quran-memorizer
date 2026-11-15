'use client';

import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useDeckStates } from '@/components/deen/item-state';
import { sessionHref } from '@/components/deen/links';
import { deckProgress, hadithHref, hadithNumber, NAWAWI_DECK, NAWAWI_TOTAL, progressLine } from './hadith-logic';
import { StateChip } from './state-chip';
import { useHadithDeck } from './use-hadith-deck';

/** /hadith: al-Nawawi's Forty, each with where the learner is, and the deck's progress */
export function HadithList() {
  const deck = useHadithDeck();
  const states = useDeckStates(NAWAWI_DECK);

  if (deck.status === 'loading') return <SkeletonRows count={6} />;
  if (deck.status === 'missing') {
    return (
      <Card>
        <p className="text-sm text-muted">The hadith could not be loaded. Close the app and open it again.</p>
      </Card>
    );
  }

  const { items } = deck;
  const progress = deckProgress(items, states);

  return (
    <div className="space-y-5">
      <div data-hadith-progress>
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <ProgressBar value={(progress.started / progress.total) * 100} className="flex-1" />
            <span className="shrink-0 text-[11px] tabular-nums text-muted">
              <span aria-hidden>
                {progress.started}/{progress.total}
              </span>
              <span className="sr-only">
                {progress.started} of {progress.total} started
              </span>
            </span>
          </div>
          <p className="text-sm text-muted">{progressLine(progress)}</p>
          {progress.due > 0 && (
            <Link
              href={sessionHref(NAWAWI_DECK)}
              className="tactile-btn flex min-h-11 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-on-teal"
              data-hadith-review
            >
              Review {progress.due === 1 ? '1 hadith' : `${progress.due} hadith`} due today
            </Link>
          )}
        </Card>
      </div>

      <ol className="space-y-2" aria-label="The hadith">
        {items.map((it) => {
          const state = states[it.id] ?? 'new';
          return (
            <li key={it.id}>
              <Link href={hadithHref(it.id)} className="block" data-hadith-row={it.id}>
                <Card pressable className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal/10 text-sm font-bold tabular-nums text-teal"
                    aria-hidden
                  >
                    {hadithNumber(it.id)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">Hadith {hadithNumber(it.id)}: </span>
                    <span className="block text-[15px] font-semibold leading-snug text-foreground">{it.title}</span>
                    {it.citations[0]?.narrator && <span className="mt-0.5 block truncate text-xs text-muted">{it.citations[0].narrator}</span>}
                  </span>
                  <StateChip state={state} />
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
