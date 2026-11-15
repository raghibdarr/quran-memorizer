'use client';

import { useState } from 'react';
import Link from '@/components/app-link';
import type { TextItem } from '@/types/deen';
import { CitationLine } from '@/components/deen/citation-line';
import { GradingLine } from '@/components/deen/grading-line';
import { ReviewBadge } from '@/components/deen/review-badge';
import { ItemArabic } from '@/components/deen/cue-text';
import { RichText } from '@/components/deen/term';
import { ITEM_STATE_LABEL, type ItemState } from '@/components/deen/item-state';
import { learnHref } from '@/components/deen/links';
import { workTitle } from '@/components/deen/registry-names';
import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { QuranRefText, refLabel, useRefAyahs } from './quran-text';

const STATE_TONE: Record<ItemState, string> = {
  new: 'text-muted',
  learning: 'text-teal',
  due: 'text-gold-deep',
  strong: 'text-success',
};

/** "Said 3 times", "Said 100 times" */
export function repeatText(n: number | undefined): string | null {
  return n && n > 1 ? `Said ${n} times` : null;
}

/**
 * One dhikr or dua in a deck list: its title and when it is said, the Arabic and
 * our translation, then where it comes from (citation, attributed grading, review
 * status) behind a "Sources" toggle, and a Memorise action that opens the deen
 * engine's Read → Build → Recall flow.
 */
export function AdhkarItemCard({ item, state }: { item: TextItem; state: ItemState }) {
  const [open, setOpen] = useState(false);
  const { surahName } = useRefAyahs(item.quran);
  const repeat = repeatText(item.usage?.repeat);
  const panelId = `sources-${item.deck}-${item.id}`;
  const hasNotes = !!item.notes?.length;
  const hasVariants = !!item.variants?.length;

  return (
    <article className="rounded-2xl border border-foreground/10 bg-card p-4" data-adhkar-item={item.id} aria-labelledby={`${panelId}-title`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${panelId}-title`} className="text-[15px] font-semibold text-foreground">
            {item.title}
          </h2>
          {item.usage?.when?.length ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              <RichText text={item.usage.when.join(' · ')} />
              {repeat && <span className="font-semibold text-foreground/80"> · {repeat}</span>}
            </p>
          ) : (
            repeat && <p className="mt-0.5 text-xs font-semibold text-foreground/80">{repeat}</p>
          )}
        </div>
        <span className={cn('shrink-0 pt-0.5 text-[11px] font-semibold', STATE_TONE[state])} data-item-state={state}>
          {ITEM_STATE_LABEL[state]}
        </span>
      </header>

      <div className="mt-3 space-y-2.5">
        {item.quran ? (
          <>
            <p className="text-xs font-medium text-muted">{refLabel(item.quran, surahName)}</p>
            <QuranRefText quran={item.quran} />
          </>
        ) : (
          <>
            {item.arabic && <ItemArabic text={item.arabic} className="text-[1.5rem]" />}
            {item.translation && (
              <p className="text-[15px] leading-relaxed text-foreground">
                <RichText text={item.translation} />
              </p>
            )}
          </>
        )}
      </div>

      {hasVariants && (
        <div className="mt-3 space-y-2 rounded-xl bg-foreground/[0.04] px-3 py-2.5">
          {item.variants!.map((v, i) => (
            <div key={i} className="space-y-1" data-variant={i}>
              <p className="text-xs leading-relaxed text-muted">
                <RichText text={v.label} />
              </p>
              <ItemArabic text={v.arabic} className="text-xl" />
              {v.citations.map((c, j) => (
                <CitationLine key={j} citation={c} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted hover:text-foreground"
        >
          Sources{hasNotes ? ' and notes' : ''}
          <ChevronDownIcon size={14} className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
        </button>
        <Link
          href={learnHref(item.deck, item.id)}
          className="tactile-chip inline-flex min-h-11 items-center rounded-full bg-teal/10 px-4 text-xs font-semibold text-teal"
          data-memorise={item.id}
        >
          {state === 'new' ? 'Memorise' : 'Go over it'}
        </Link>
      </div>

      {open && (
        <div id={panelId} className="mt-1 space-y-3 border-t border-foreground/10 pt-3">
          {(item.citations.length > 0 || item.gradings.length > 0) && (
            <div className="space-y-2">
              {item.citations.map((c, i) => (
                <CitationLine key={i} citation={c} />
              ))}
              {item.gradings.map((g, i) => (
                <GradingLine key={i} grading={g} />
              ))}
            </div>
          )}
          {item.usage?.evidence && (
            <p className="text-[13px] leading-relaxed text-muted">
              <RichText text={item.usage.evidence} />
            </p>
          )}
          {hasNotes && (
            <ul className="space-y-2">
              {item.notes!.map((n, i) => (
                <li key={i} className="text-[13px] leading-relaxed text-foreground">
                  <RichText text={n.text} />{' '}
                  <span className="text-xs text-muted">
                    ({workTitle(n.source.work)}, {n.source.location})
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ReviewBadge review={item.review} />
        </div>
      )}
    </article>
  );
}

export default AdhkarItemCard;
