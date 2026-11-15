import { Suspense } from 'react';
import type { Metadata } from 'next';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import ViewClient from './view-client';

export const metadata: Metadata = { title: 'Hadith · Takrar' };

/** /hadith/view?id= (all-in-one spec 2.2): one hadith of the Forty */
export default function Page() {
  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/hadith" className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Forty Hadith</h1>
          <span aria-hidden />
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 pt-5">
        {/* Suspense: the client reads useSearchParams, which static export requires to be bounded */}
        <Suspense>
          <ViewClient />
        </Suspense>
      </main>

      <BottomNav />
    </div>
  );
}
