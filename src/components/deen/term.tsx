'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import Link from '@/components/app-link';
import BottomSheet from '@/components/ui/bottom-sheet';
import { loadGlossary, splitTerms } from '@/lib/deen/glossary';
import { cardId, termCard } from '@/lib/deen/cards';
import { useDeenStore } from '@/stores/deen-store';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import type { GlossaryTerm } from '@/types/deen';
import { GLOSSARY_DECK } from './deck-source';

let cached: Map<string, GlossaryTerm> | null = null;

/** Every glossary term (core plus live decks'), null until loaded */
export function useGlossary(): Map<string, GlossaryTerm> | null {
  const [terms, setTerms] = useState(cached);
  useEffect(() => {
    if (cached) return;
    let live = true;
    loadGlossary()
      .then((m) => {
        cached = m;
        if (live) setTerms(m);
      })
      .catch(() => live && setTerms(new Map()));
    return () => {
      live = false;
    };
  }, []);
  return terms;
}

/** The term's details and "Learn this term"; seeAlso links switch the sheet in place */
export function TermDetails({ term, terms, onSelect, hideHeading }: { term: GlossaryTerm; terms: Map<string, GlossaryTerm>; onSelect?: (id: string) => void; hideHeading?: boolean }) {
  const id = cardId(GLOSSARY_DECK, term.id, 'term');
  const has = useDeenStore((s) => !!s.cards[id]);
  const addCards = useDeenStore((s) => s.addCards);
  const [justAdded, setJustAdded] = useState(false);
  const related = (term.seeAlso ?? []).map((s) => terms.get(s)).filter((t): t is GlossaryTerm => !!t);

  return (
    <div className="space-y-4 pb-2">
      {!hideHeading && (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xl font-bold text-foreground">{term.translit}</p>
          <p className="arabic-text text-2xl text-teal" lang="ar">{term.arabic}</p>
        </div>
      )}
      <p className="text-sm leading-relaxed text-foreground">{term.short}</p>
      {term.long && <p className="text-sm leading-relaxed text-muted">{term.long}</p>}
      {related.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>See also</span>
          {related.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect?.(t.id)}
              className="min-h-9 rounded-full bg-foreground/[0.05] px-3 font-semibold text-foreground hover:bg-foreground/10"
            >
              {t.translit}
            </button>
          ))}
        </div>
      )}
      {has ? (
        <p className="rounded-xl bg-success/10 px-3 py-2.5 text-center text-sm font-semibold text-success" role="status">
          {justAdded ? 'Added. It comes up in your reviews.' : 'In your reviews'}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => {
            addCards(termCard(term.id));
            setJustAdded(true);
            haptic.success();
          }}
          className="tactile-btn min-h-11 w-full rounded-xl bg-teal px-4 text-sm font-semibold text-on-teal"
        >
          Learn this term
        </button>
      )}
    </div>
  );
}

/** A bottom sheet for one term (and any it links to) */
export function TermSheet({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const terms = useGlossary();
  const [shown, setShown] = useState(id);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setShown(id);
  }
  const term = terms?.get(shown);
  return (
    <BottomSheet open={open} onClose={onClose} title={term ? `${term.translit}: meaning` : 'Term'} titleHidden>
      {!terms ? (
        <p className="py-6 text-center text-sm text-muted">Loading…</p>
      ) : term ? (
        <TermDetails term={term} terms={terms} onSelect={setShown} />
      ) : (
        <p className="py-6 text-center text-sm text-muted">This term isn&apos;t in the glossary yet.</p>
      )}
      <Link href={`/glossary#${shown}`} className="mt-2 flex min-h-11 items-center justify-center text-sm font-semibold text-teal" onClick={onClose}>
        All terms
      </Link>
    </BottomSheet>
  );
}

/**
 * An Arabic term kept in English: tap to see what it means, in place (spec 5.6).
 * Children default to the term's transliteration.
 */
export function Term({ id, children, className }: { id: string; children?: ReactNode; className?: string }) {
  const terms = useGlossary();
  const [open, setOpen] = useState(false);
  const label = children ?? terms?.get(id)?.translit ?? id;
  return (
    <>
      <button
        type="button"
        data-term={id}
        onClick={(e) => {
          e.stopPropagation();
          haptic.selection();
          setOpen(true);
        }}
        className={cn(
          'inline cursor-pointer rounded-sm p-0 align-baseline font-[inherit] text-[length:inherit] italic text-inherit',
          'underline decoration-gold decoration-dotted decoration-[1.5px] underline-offset-[3px] hover:bg-gold/10',
          className,
        )}
      >
        {label}
      </button>
      <TermSheet id={id} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Authored English with [[term-id]] marks rendered as tappable terms */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = splitTerms(text);
  return (
    <span className={className}>
      {parts.map((p, i) => (
        <Fragment key={i}>{'term' in p ? <Term id={p.term} /> : p.text}</Fragment>
      ))}
    </span>
  );
}

export default Term;
