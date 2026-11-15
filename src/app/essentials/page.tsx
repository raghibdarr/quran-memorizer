'use client';

import Link from '@/components/app-link';

import { useEffect, useState } from 'react';
import { getEssentialsIndex, liveCollections } from '@/lib/essentials-data';
import type { EssentialCollection } from '@/types/quran';
import { useEssentialsStore } from '@/stores/essentials-store';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import { usePlanStore } from '@/stores/plan-store';
import { PLAN_PRESETS } from '@/lib/plan-presets';
import { GUIDES } from '@/content/guides';
import { LearnRows } from '@/components/essentials/learn-rows';

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
 * The Learn tab: hadith, adhkar and duas, the Names and the course; memorisation
 * plans; the guides; and the key ayahs. It keeps the /essentials address (/learn
 * is the lesson player).
 */
export default function EssentialsPage() {
  const plan = usePlanStore((s) => s.plan);
  const [collections, setCollections] = useState<EssentialCollection[]>([]);
  const memorized = useEssentialsStore((s) => s.memorized);

  useEffect(() => {
    getEssentialsIndex().then((all) => setCollections(liveCollections(all)));
  }, []);

  // Only Key ayahs stays here: the older duas, adhkar and tasbih collections
  // were replaced by the checked decks above (their addresses redirect there)
  const keyAyahs = collections[0] ?? null;
  const keyDone = keyAyahs ? keyAyahs.items.filter((i) => memorized[i.id]).length : 0;

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <header className="sticky top-[var(--safe-top)] z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Learn</h1>
              <p className="text-sm text-muted">Plans, guides, hadith, duas and the Names</p>
            </div>
            <div className="flex items-center gap-2">
              <SettingsPanel />
              <UserButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-3">
        {/* All-in-one slot: Hadith, Adhkar and duas, Names, course (deen-engine; hidden until a deck ships) */}
        <LearnRows />

        {/* Plans: your own, or the ready-made ones to start from */}
        <SectionHead title="Memorisation plans" href="/plans" more={plan ? 'Ready-made plans' : 'All plans'} />
        {plan ? (
          <Row href="/plan" title="Your plan" detail="Today's lessons, reviews and pace" />
        ) : (
          PLAN_PRESETS.slice(0, 3).map((p) => <Row key={p.id} href={`/plan/setup?preset=${p.id}`} title={p.title} detail={p.summary} />)
        )}

        <SectionHead title="Guides" href="/blog" more="All guides" />
        {GUIDES.slice(0, 3).map((g) => <Row key={g.slug} href={`/blog/${g.slug}`} title={g.title} detail={`${g.minutes} min read · ${g.summary}`} />)}

        {keyAyahs && (
          <>
            <SectionHead title="Key ayahs" />
            <Link href={`/essentials/${keyAyahs.id}`} className="block" data-key-ayahs>
              <Card pressable>
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-foreground">Ayat al-Kursi and the end of al-Baqarah</span>
                    <span className="mt-0.5 block text-xs text-muted">Read at night, with the hadith on each</span>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar value={(keyDone / keyAyahs.items.length) * 100} className="flex-1" />
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {keyDone === 0 ? (
                      `${keyAyahs.items.length} to learn`
                    ) : (
                      <>
                        <span aria-hidden>
                          {keyDone}/{keyAyahs.items.length}
                        </span>
                        <span className="sr-only">
                          {keyDone} of {keyAyahs.items.length} memorised
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </Card>
            </Link>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
