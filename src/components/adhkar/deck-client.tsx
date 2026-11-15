'use client';

import { useSearchParams } from 'next/navigation';
import Link from '@/components/app-link';
import BottomNav from '@/components/layout/bottom-nav';
import ScreenHeader from '@/components/worship/screen-header';
import { useDeckStates } from '@/components/deen/item-state';
import { deckInfo } from '@/content/deen/registry';
import { ADHKAR_SETS, SET_IDS, nowHref } from './sets';
import { AdhkarItemCard } from './item-card';
import { useAdhkarDeck } from './use-deck';
import { useEssentialsMigration } from './use-migration';

/** /adhkar/view?d=<deck>: every shipped item of one adhkar deck, each with its sources and a Memorise action */
export default function AdhkarDeckClient() {
  useEssentialsMigration();
  const params = useSearchParams();
  const id = params.get('d');
  const info = id ? deckInfo(id) : undefined;
  const load = useAdhkarDeck(info?.group === 'adhkar' ? id : null);
  const states = useDeckStates(id ?? '');
  const sets = SET_IDS.map((s) => ADHKAR_SETS[s]).filter((s) => s.deck === id);
  const title = info?.title ?? 'Adhkar and duas';

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-adhkar-deck={id ?? ''}>
      <ScreenHeader title={title} back="/adhkar" />
      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-4">
        {load.status === 'loading' && <div className="h-40 rounded-2xl border border-foreground/10 bg-card" aria-busy="true" />}

        {load.status === 'missing' && (
          <div className="rounded-2xl border border-foreground/10 bg-card px-5 py-8 text-center">
            <p className="text-sm text-muted">This set isn&rsquo;t here yet.</p>
            <Link href="/adhkar" className="mt-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal">
              All adhkar and duas
            </Link>
          </div>
        )}

        {load.status === 'ready' && (
          <>
            {info?.blurb && <p className="px-1 text-sm text-muted">{info.blurb}</p>}
            {sets.length > 0 && (
              <div className="flex flex-wrap gap-2" data-deck-sets>
                {sets.map((s) => (
                  <Link key={s.id} href={nowHref(s.id)} className="tactile-chip inline-flex min-h-11 items-center rounded-full bg-teal px-4 text-sm font-semibold text-on-teal">
                    Say the {s.short.toLowerCase()} set
                  </Link>
                ))}
              </div>
            )}
            {load.items.length === 0 ? (
              <p className="rounded-2xl border border-foreground/10 bg-card px-5 py-8 text-center text-sm text-muted">Nothing in this set has passed its source check yet.</p>
            ) : (
              load.items.map((item) => <AdhkarItemCard key={item.id} item={item} state={states[item.id] ?? 'new'} />)
            )}
            <p className="px-1 pt-2 text-xs leading-relaxed text-muted">
              Arabic checked against two printed editions. Translations are our own.{' '}
              <Link href="/sources" className="font-semibold text-teal">
                How we check
              </Link>
            </p>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
