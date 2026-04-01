'use client';

import { useEffect, useState } from 'react';
import { getEssentialsIndex } from '@/lib/essentials-data';
import type { EssentialCollection } from '@/types/quran';
import { useEssentialsStore } from '@/stores/essentials-store';
import Card from '@/components/ui/card';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';

export default function EssentialsPage() {
  const [collections, setCollections] = useState<EssentialCollection[]>([]);
  const memorized = useEssentialsStore((s) => s.memorized);

  useEffect(() => {
    getEssentialsIndex().then(setCollections);
  }, []);

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-4 backdrop-blur-sm">
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
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4">
        {collections.map((collection) => {
          const memorizedCount = collection.items.filter((i) => memorized[i.id]).length;

          return (
            <a key={collection.id} href={`/essentials/${collection.id}`} className="block">
              <Card className="transition-all hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-foreground">{collection.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{collection.description}</p>
                    <p className="mt-1 text-xs text-muted">
                      {collection.items.length} items
                      {memorizedCount > 0 && (
                        <span className="text-success"> · {memorizedCount} memorized</span>
                      )}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Card>
            </a>
          );
        })}
      </main>

      <BottomNav />
    </div>
  );
}
