'use client';

import Link from '@/components/app-link';

import { useEffect, useMemo, useState } from 'react';
import { getEssentialsIndex } from '@/lib/essentials-data';
import type { EssentialCollection } from '@/types/quran';
import { useEssentialsStore } from '@/stores/essentials-store';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import EssentialCard from '@/components/essentials/essential-card';
import { usePlanStore } from '@/stores/plan-store';
import { PLAN_PRESETS } from '@/lib/plan-presets';
import { GUIDES } from '@/content/guides';

/** A section heading with a "see all" link */
function SectionHead({ title, href, more }: { title: string; href?: string; more?: string }) {
  return (
    <div className="flex items-baseline justify-between px-1 pt-3">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {href && <Link href={href} className="text-sm font-semibold text-teal">{more ?? 'See all'}</Link>}
    </div>
  );
}

/** A tappable row: title and one line of detail */
function Row({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="block">
      <Card pressable className="flex items-center justify-between gap-3 py-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">{detail}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Card>
    </Link>
  );
}

/**
 * The Learn tab: memorisation plans, the guides, and the essentials (duas, dhikr and key
 * ayahs). It keeps the /essentials address (/learn is the lesson player).
 */
export default function EssentialsPage() {
  const plan = usePlanStore((s) => s.plan);
  const [collections, setCollections] = useState<EssentialCollection[]>([]);
  const [search, setSearch] = useState('');
  const memorized = useEssentialsStore((s) => s.memorized);
  const favorites = useEssentialsStore((s) => s.favorites);

  useEffect(() => {
    getEssentialsIndex().then(setCollections);
  }, []);

  // Flat list of favorited items across all collections
  const favoriteItems = useMemo(() => {
    return collections.flatMap((c) => c.items.filter((i) => favorites[i.id]));
  }, [collections, favorites]);

  // Cross-collection search results
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as { collectionId: string; collectionTitle: string; item: EssentialCollection['items'][number] }[];
    const matches: { collectionId: string; collectionTitle: string; item: EssentialCollection['items'][number] }[] = [];
    for (const c of collections) {
      for (const item of c.items) {
        if (
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.transliteration.toLowerCase().includes(q) ||
          item.translation.toLowerCase().includes(q)
        ) {
          matches.push({ collectionId: c.id, collectionTitle: c.title, item });
        }
      }
    }
    return matches;
  }, [collections, search]);

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <header className="sticky top-[var(--safe-top)] z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Learn</h1>
              <p className="text-sm text-muted">Plans, guides, duas and dhikr</p>
            </div>
            <div className="flex items-center gap-2">
              <SettingsPanel />
              <UserButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-3">
        {/* Plans: your own, or the ready-made ones to start from */}
        <SectionHead title="Memorisation plans" href="/plans" more={plan ? 'Ready-made plans' : 'All plans'} />
        {plan ? (
          <Row href="/plan" title="Your plan" detail="Today's lessons, reviews and pace" />
        ) : (
          PLAN_PRESETS.slice(0, 3).map((p) => <Row key={p.id} href={`/plan/setup?preset=${p.id}`} title={p.title} detail={p.summary} />)
        )}

        <SectionHead title="Guides" href="/blog" more="All guides" />
        {GUIDES.slice(0, 3).map((g) => <Row key={g.slug} href={`/blog/${g.slug}`} title={g.title} detail={`${g.minutes} min read · ${g.summary}`} />)}

        <SectionHead title="Duas, dhikr and key ayahs" />
        {/* Search sits with what it searches */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search duas, dhikr and key ayahs…"
          className="w-full rounded-xl border border-foreground/10 bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
        />
        {search.trim() ? (
          searchResults.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No matches across collections.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
              </p>
              {searchResults.map(({ collectionId, collectionTitle, item }) => (
                <div key={`${collectionId}-${item.id}`}>
                  <p className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted/60">{collectionTitle}</p>
                  <EssentialCard item={item} />
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            {favoriteItems.length > 0 && (
              <Card className="border-l-4 border-l-gold">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Favorites</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {favoriteItems.length} pinned item{favoriteItems.length === 1 ? '' : 's'}
                </p>
                <p className="mt-1 text-[11px] text-muted">Tap the star on any item to pin it for quick access.</p>
              </Card>
            )}

            {collections.map((collection) => {
              const total = collection.items.length;
              const memorizedCount = collection.items.filter((i) => memorized[i.id]).length;
              const pct = total > 0 ? (memorizedCount / total) * 100 : 0;
              const favCount = collection.items.filter((i) => favorites[i.id]).length;

              return (
                <Link key={collection.id} href={`/essentials/${collection.id}`} className="block">
                  <Card className="transition-all hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-foreground">{collection.title}</p>
                        <p className="mt-0.5 text-xs text-muted">{collection.description}</p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={pct} className="flex-1" />
                      <span className="text-[11px] text-muted">
                        {memorizedCount}/{total}
                      </span>
                    </div>
                    {favCount > 0 && (
                      <p className="mt-1.5 text-[10px] text-gold">★ {favCount} favorited</p>
                    )}
                  </Card>
                </Link>
              );
            })}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
