'use client';

import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import { useDeenQueue } from '@/hooks/use-deen-queue';
import { deckTitleOf } from '@/components/deen/deck-source';
import { sessionHref } from '@/components/deen/links';
import { whenLabel } from '@/components/deen/session-player';
import { DEEN_REVIEW_CAP } from '@/lib/deen/queue';
import { useDeenStore } from '@/stores/deen-store';

/**
 * Slot (all-in-one spec 2.5, 3.4) under the Quran streams on the Review tab:
 * "Hadith, duas and Names", due counts per deck, Start → /review/deen. Owner:
 * deen-engine. Renders nothing until there are deen cards. Never badges the
 * tab, never gates "day complete".
 */
/** New cards held back by the daily cap: say they are waiting, never "all done" */
export function waitingLine(waiting: number, newPerDay: number): string {
  return `${waiting} new ${waiting === 1 ? 'card is' : 'cards are'} waiting. They start on the coming days, ${newPerDay} new a day.`;
}

export function DeenReviewSection() {
  const q = useDeenQueue();
  const newPerDay = useDeenStore((s) => s.newPerDay);
  if (!q.ready || q.cardCount === 0) return null;

  const total = q.order.length;
  // Live decks in registry order, then the glossary's term cards
  const order = [...q.decks.map((d) => d.id), 'glossary'];
  const rows = order
    .map((id) => ({ id, due: q.perDeck[id]?.due ?? 0, fresh: q.perDeck[id]?.fresh ?? 0 }))
    .filter((r) => r.due + r.fresh > 0);

  return (
    <section aria-labelledby="deen-review-title" className="space-y-2" data-deen-review-section>
      <h2 id="deen-review-title" className="px-1 pt-2 text-base font-bold text-foreground">
        Hadith, duas and Names
      </h2>
      <Card variant="tactile" className="space-y-3">
        {total > 0 ? (
          <>
            <ul className="-my-1 divide-y divide-foreground/10">
              {rows.map((r) => (
                <li key={r.id} data-deck-row={r.id}>
                  <Link href={sessionHref(r.id)} className="flex min-h-11 items-center justify-between gap-3 text-sm hover:text-teal">
                    <span className="min-w-0 truncate font-semibold text-foreground">{deckTitleOf(r.id)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {[r.due > 0 && `${r.due} due`, r.fresh > 0 && `${r.fresh} new`].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {q.dueTotal > q.due.length && (
              <p className="text-xs text-muted">Up to {DEEN_REVIEW_CAP} reviews a day. The rest wait for tomorrow.</p>
            )}
            {q.waiting > 0 && <p className="text-xs text-muted">{waitingLine(q.waiting, newPerDay)}</p>}
            <Link
              href={sessionHref()}
              className="tactile-btn flex min-h-11 w-full items-center justify-center rounded-xl bg-teal px-6 py-3 font-semibold text-on-teal hover:bg-teal-light sm:w-auto sm:px-8"
              data-deen-start
            >
              Start · {total} {total === 1 ? 'card' : 'cards'}
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted" data-deen-caught-up data-waiting={q.waiting}>
            {q.waiting > 0 ? (
              waitingLine(q.waiting, newPerDay)
            ) : (
              <>
                All done for today.
                {q.dueTotal > 0 ? ' The rest wait for tomorrow.' : q.nextDue ? ` The next card comes back ${whenLabel(q.nextDue)}.` : ''}
              </>
            )}
          </p>
        )}
      </Card>
    </section>
  );
}

export default DeenReviewSection;
