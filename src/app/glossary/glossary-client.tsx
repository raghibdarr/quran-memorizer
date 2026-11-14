'use client';

import { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import { ChevronDownIcon } from '@/components/ui/icons';
import { sortedTerms } from '@/lib/deen/glossary';
import { cn } from '@/lib/cn';
import { TermDetails, useGlossary } from '@/components/deen/term';
import { matchesTerm } from '@/components/deen/glossary-search';

/**
 * /glossary (all-in-one spec 2.2): every Arabic term the app keeps in English,
 * core terms plus each live deck's, searchable. A term opens in place, with
 * "Learn this term". /glossary#<id> opens that term.
 */
export default function GlossaryScreen() {
  const terms = useGlossary();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => (terms ? sortedTerms(terms) : []), [terms]);
  const shown = useMemo(() => list.filter((t) => matchesTerm(t, query)), [list, query]);

  // /glossary#wudu: open that term once the list is in
  useEffect(() => {
    if (!terms) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !terms.has(id)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL hash after load
    setOpen(id);
    requestAnimationFrame(() => document.getElementById(`term-${id}`)?.scrollIntoView({ block: 'start' }));
  }, [terms]);

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/essentials" className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Glossary</h1>
          <span aria-hidden />
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
        <p className="text-sm leading-relaxed text-muted">
          Arabic terms used in Takrar, in plain words. Tap one to read more, or to add it to your reviews.
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms, in English or Arabic"
          aria-label="Search terms"
          className="w-full rounded-xl border border-foreground/15 bg-card px-4 py-3 text-base text-foreground placeholder:text-muted/60 focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
        />

        {!terms ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No term matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <ul className="divide-y divide-foreground/10 overflow-hidden rounded-2xl border border-foreground/10 bg-card" data-glossary-list>
            {shown.map((t) => {
              const isOpen = open === t.id;
              return (
                <li key={t.id} id={`term-${t.id}`} className="scroll-mt-20" data-term-row={t.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : t.id)}
                    aria-expanded={isOpen}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.02]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{t.translit}</span>
                      {!isOpen && <span className="mt-0.5 block truncate text-xs text-muted">{t.short}</span>}
                    </span>
                    <span className="arabic-text shrink-0 text-xl text-teal" lang="ar">{t.arabic}</span>
                    <ChevronDownIcon size={16} className={cn('shrink-0 text-muted transition-transform motion-reduce:transition-none', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <TermDetails term={t} terms={terms} hideHeading onSelect={(id) => {
                        setQuery('');
                        setOpen(id);
                        requestAnimationFrame(() => document.getElementById(`term-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
                      }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-center text-xs text-muted">{list.length} terms</p>
      </main>

      <BottomNav />
    </div>
  );
}
