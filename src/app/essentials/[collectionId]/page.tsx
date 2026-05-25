'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCollection } from '@/lib/essentials-data';
import type { EssentialCollection, EssentialItem } from '@/types/quran';
import { useEssentialsStore } from '@/stores/essentials-store';
import EssentialCard from '@/components/essentials/essential-card';
import ReciteMode from '@/components/essentials/recite-mode';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import { cn } from '@/lib/cn';

type CategoryFilter = 'all' | 'dua' | 'dhikr' | 'ayah';

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  dua: 'Duas',
  dhikr: 'Dhikr',
  ayah: 'Ayahs',
};

export default function CollectionPage() {
  const params = useParams();
  const collectionId = params.collectionId as string;
  const [collection, setCollection] = useState<EssentialCollection | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [reciteOpen, setReciteOpen] = useState(false);
  const favorites = useEssentialsStore((s) => s.favorites);

  useEffect(() => {
    getCollection(collectionId).then((c) => setCollection(c ?? null));
  }, [collectionId]);

  const filteredItems = useMemo(() => {
    if (!collection) return [] as EssentialItem[];
    const q = search.trim().toLowerCase();
    let items = collection.items;
    if (category !== 'all') items = items.filter((i) => i.category === category);
    if (q) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.transliteration.toLowerCase().includes(q) ||
          i.translation.toLowerCase().includes(q),
      );
    }
    // Sort: favorites first, then original order
    return [...items].sort((a, b) => {
      const af = favorites[a.id] ? 1 : 0;
      const bf = favorites[b.id] ? 1 : 0;
      return bf - af;
    });
  }, [collection, search, category, favorites]);

  const availableCategories = useMemo(() => {
    if (!collection) return new Set<string>();
    return new Set(collection.items.map((i) => i.category));
  }, [collection]);

  if (!collection) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/essentials" className="text-sm text-muted hover:text-foreground">
                ← Back
              </a>
            </div>
            <div className="flex items-center gap-2">
              <SettingsPanel />
              <UserButton />
            </div>
          </div>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-foreground">{collection.title}</h1>
              <p className="mt-0.5 text-sm text-muted">{collection.description}</p>
            </div>
            {collection.items.length > 1 && (
              <button
                onClick={() => setReciteOpen(true)}
                className="shrink-0 rounded-full bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
              >
                Recite all →
              </button>
            )}
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this collection..."
            className="mt-3 w-full rounded-xl border border-foreground/10 bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
          />

          {/* Category filter — only show if collection has multiple categories */}
          {availableCategories.size > 1 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((c) => {
                if (c !== 'all' && !availableCategories.has(c)) return null;
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={cn(
                      'shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                      category === c
                        ? 'bg-teal text-white'
                        : 'bg-foreground/5 text-muted hover:bg-foreground/10',
                    )}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-3">
        {filteredItems.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">No items match.</p>
        ) : (
          filteredItems.map((item) => (
            <EssentialCard key={item.id} item={item} />
          ))
        )}
      </main>

      {reciteOpen && (
        <ReciteMode
          items={filteredItems.length > 0 ? filteredItems : collection.items}
          onClose={() => setReciteOpen(false)}
        />
      )}

      <BottomNav />
    </div>
  );
}
