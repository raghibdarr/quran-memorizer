import type { Metadata } from 'next';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import { HadithList } from '@/components/hadith/hadith-list';

export const metadata: Metadata = { title: 'Forty Hadith · Takrar' };

/** /hadith (all-in-one spec 2.2): al-Nawawi's Forty, with where you are in each */
export default function Page() {
  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/essentials" className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Forty Hadith</h1>
          <span aria-hidden />
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-foreground">The Forty Hadith of al-Nawawi</h2>
          <p className="text-sm leading-relaxed text-muted">
            Imam al-Nawawi gathered forty-two short hadith, each one a foundation of the religion. Read each with its meaning, then learn
            it by heart a part at a time.
          </p>
        </div>
        <HadithList />
      </main>

      <BottomNav />
    </div>
  );
}
