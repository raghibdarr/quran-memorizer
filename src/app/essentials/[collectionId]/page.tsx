'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCollection } from '@/lib/essentials-data';
import type { EssentialCollection } from '@/types/quran';
import EssentialCard from '@/components/essentials/essential-card';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';

export default function CollectionPage() {
  const params = useParams();
  const collectionId = params.collectionId as string;
  const [collection, setCollection] = useState<EssentialCollection | null>(null);

  useEffect(() => {
    getCollection(collectionId).then((c) => setCollection(c ?? null));
  }, [collectionId]);

  if (!collection) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-4 backdrop-blur-sm">
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
          <div className="mt-3">
            <h1 className="text-xl font-bold text-foreground">{collection.title}</h1>
            <p className="mt-0.5 text-sm text-muted">{collection.description}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4">
        {collection.items.map((item) => (
          <EssentialCard key={item.id} item={item} />
        ))}
      </main>

      <BottomNav />
    </div>
  );
}
