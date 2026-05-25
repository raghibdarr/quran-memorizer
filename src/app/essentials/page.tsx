'use client';

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

export default function EssentialsPage() {
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
    <div className="min-h-screen bg-cream pb-20">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Essentials</h1>
              <p className="text-sm text-muted">Duas, dhikr & key ayahs</p>
            </div>
            <div className="flex items-center gap-2">
              <SettingsPanel />
              <UserButton />
            </div>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all essentials..."
            className="mt-3 w-full rounded-xl border border-foreground/10 bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
          />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-3">
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
                <a key={collection.id} href={`/essentials/${collection.id}`} className="block">
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
                </a>
              );
            })}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
