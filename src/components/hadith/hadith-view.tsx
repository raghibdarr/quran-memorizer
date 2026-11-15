'use client';

import type { ReactNode } from 'react';
import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { CitationLine } from '@/components/deen/citation-line';
import { GradingLine } from '@/components/deen/grading-line';
import { ReviewBadge } from '@/components/deen/review-badge';
import { ReportProblem } from '@/components/deen/report-problem';
import { RichText } from '@/components/deen/term';
import { useItemState } from '@/components/deen/item-state';
import { learnHref, sessionHref } from '@/components/deen/links';
import type { TextItem } from '@/types/deen';
import { cn } from '@/lib/cn';
import { hadithHref, hadithNumber, NAWAWI_DECK, NAWAWI_TOTAL, neighbours, normaliseHadithId, readingParts } from './hadith-logic';
import { StateChip } from './state-chip';
import { useHadithDeck } from './use-hadith-deck';

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2', className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

/** The Arabic, one sentence-group per line where the text has authored segments */
function HadithArabic({ item }: { item: TextItem }) {
  const parts = readingParts(item.arabic ?? '', item.segments);
  return (
    <div dir="rtl" lang="ar" className="space-y-3" data-hadith-arabic>
      {parts.map((p, i) => (
        <p key={i} className="arabic-text text-[1.5rem] text-foreground" style={{ lineHeight: 2.1, textAlign: 'right' }}>
          {p}
        </p>
      ))}
    </div>
  );
}

function Actions({ item }: { item: TextItem }) {
  const state = useItemState(NAWAWI_DECK, item.id);
  const started = state !== 'new';
  return (
    <div className="space-y-2" data-hadith-actions>
      {state === 'due' && (
        <Link
          href={sessionHref(NAWAWI_DECK)}
          className="tactile-btn flex min-h-12 items-center justify-center rounded-xl bg-teal px-5 font-semibold text-on-teal"
        >
          Review it now
        </Link>
      )}
      <Link
        href={learnHref(NAWAWI_DECK, item.id, 'arabic')}
        className={cn(
          'flex min-h-12 items-center justify-center rounded-xl px-5 font-semibold',
          state === 'due' ? 'tactile-btn bg-gold/10 text-gold-deep' : 'tactile-btn bg-teal text-on-teal',
        )}
        data-start-memorising
      >
        {started ? 'Memorise it again' : 'Start memorising'}
      </Link>
      <Link
        href={learnHref(NAWAWI_DECK, item.id, 'meaning')}
        className="flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-teal hover:bg-teal/5"
        data-learn-meaning
      >
        Just learn the meaning
      </Link>
    </div>
  );
}

function Found({ item, items }: { item: TextItem; items: TextItem[] }) {
  const state = useItemState(NAWAWI_DECK, item.id);
  const n = hadithNumber(item.id);
  const { prev, next } = neighbours(items, item.id);

  return (
    <article className="space-y-6" data-hadith={item.id}>
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-muted">
            Hadith {n} of {NAWAWI_TOTAL}
          </p>
          <StateChip state={state} />
        </div>
        <h2 className="text-xl font-bold leading-snug text-foreground">{item.title}</h2>
      </header>

      <Card className="space-y-5 px-4 py-5">
        <HadithArabic item={item} />
        <div className="border-t border-foreground/10 pt-4">
          <p className="text-[15px] leading-relaxed text-foreground" data-hadith-translation>
            <RichText text={item.translation ?? ''} />
          </p>
        </div>
      </Card>

      <Actions item={item} />

      <Section title="Source">
        <div className="space-y-2">
          {item.citations.map((c) => (
            <CitationLine key={`${c.collection}-${c.number}`} citation={c} />
          ))}
        </div>
        {item.gradings.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {item.gradings.map((g, i) => (
              <GradingLine key={`${g.by}-${i}`} grading={g} />
            ))}
          </div>
        )}
      </Section>

      {item.variants && item.variants.length > 0 && (
        <Section title="Another wording">
          {item.variants.map((v, i) => (
            <div key={i} className="space-y-2 rounded-xl bg-foreground/[0.03] px-4 py-3">
              <p dir="rtl" lang="ar" className="arabic-text text-xl text-foreground" style={{ lineHeight: 2, textAlign: 'right' }}>
                {v.arabic}
              </p>
              <p className="text-sm text-foreground">
                <RichText text={v.label} />
              </p>
              {v.citations.map((c) => (
                <CitationLine key={`${c.collection}-${c.number}`} citation={c} />
              ))}
            </div>
          ))}
        </Section>
      )}

      {item.notes && item.notes.length > 0 && (
        <Section title="Notes">
          <ul className="space-y-3">
            {item.notes.map((note, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground">
                <RichText text={note.text} />
                <span className="mt-0.5 block text-xs text-muted">
                  {note.source.work}, {note.source.location}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/10 pt-4">
        <ReviewBadge review={item.review} />
        <ReportProblem itemId={`${NAWAWI_DECK}:${item.id}`} rev={item.rev} title={`Hadith ${n}: ${item.title}`} />
      </div>

      <nav aria-label="Other hadith" className="grid grid-cols-2 gap-2">
        {prev ? (
          <Link href={hadithHref(prev.id)} className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-teal hover:bg-teal/5">
            <ChevronLeftIcon size={14} />
            <span className="truncate">Hadith {hadithNumber(prev.id)}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={hadithHref(next.id)}
            className="flex min-h-11 items-center justify-end gap-1 rounded-xl px-2 text-sm font-semibold text-teal hover:bg-teal/5"
          >
            <span className="truncate">Hadith {hadithNumber(next.id)}</span>
            <ChevronLeftIcon size={14} className="rotate-180" />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}

/** /hadith/view?id=: one hadith with its Arabic, our translation, its source and grading, and the ways to learn it */
export function HadithView({ rawId }: { rawId: string | null }) {
  const deck = useHadithDeck();
  const id = normaliseHadithId(rawId);

  if (deck.status === 'loading') {
    return (
      <div className="space-y-4" role="status" aria-label="Loading">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-56" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  const item = deck.status === 'ready' && id ? deck.items.find((it) => it.id === id) : undefined;
  if (!item || deck.status !== 'ready') {
    return (
      <div data-hadith-missing>
        <Card className="space-y-3 text-center">
          <p className="font-semibold text-foreground">This hadith isn&apos;t here yet</p>
          <p className="text-sm text-muted">Each one appears once its text, translation and source have been checked.</p>
          <Link href="/hadith" className="inline-flex min-h-11 items-center font-semibold text-teal">
            See the hadith that are ready
          </Link>
        </Card>
      </div>
    );
  }
  return <Found item={item} items={deck.items} />;
}
