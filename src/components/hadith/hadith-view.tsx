'use client';

import { Fragment, type ReactNode } from 'react';
import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { openExternal } from '@/components/deen/citation-line';
import { GradingLine } from '@/components/deen/grading-line';
import { collectionName, numberingLabel, sunnahComUrl } from '@/components/deen/registry-names';
import { ReviewBadge } from '@/components/deen/review-badge';
import { ReportProblem } from '@/components/deen/report-problem';
import { RichText } from '@/components/deen/term';
import { useItemState } from '@/components/deen/item-state';
import { useDeenStore } from '@/stores/deen-store';
import { learnHref, sessionHref } from '@/components/deen/links';
import type { Citation, TextItem } from '@/types/deen';
import { cn } from '@/lib/cn';
import {
  hadithHref,
  hadithNumber,
  inSahihLine,
  learnActions,
  NAWAWI_DECK,
  NAWAWI_TOTAL,
  neighbours,
  normaliseHadithId,
  readingParts,
  sourceRows,
  translationParagraphs,
} from './hadith-logic';
import { StateChip } from './state-chip';
import { useHadithDeck } from './use-hadith-deck';

/** The quiet link style shared by the secondary actions on this screen */
const QUIET_LINK = 'pressable flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-teal transition-colors hover:bg-teal/5';

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2', className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The Arabic, one authored segment per paragraph, set as the memorise flow sets
 * it (centred, balanced lines) so starting to memorise does not re-typeset it.
 * Inline style: the global .arabic-text rule outranks utility classes.
 */
function HadithArabic({ item }: { item: TextItem }) {
  const parts = readingParts(item.arabic ?? '', item.segments);
  return (
    <div dir="rtl" lang="ar" className="mx-auto max-w-[30rem] space-y-4" data-hadith-arabic>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden className="mx-auto block h-1 w-1 rounded-full bg-gold/60" />}
          <p className="arabic-text text-[1.625rem] text-foreground sm:text-[1.75rem]" style={{ lineHeight: 2, textAlign: 'center', textWrap: 'balance' }}>
            {p}
          </p>
        </Fragment>
      ))}
    </div>
  );
}

/** Our translation, in paragraphs that break where the Arabic segments do */
function HadithTranslation({ item }: { item: TextItem }) {
  const paragraphs = translationParagraphs(item.translation);
  return (
    <div className="mx-auto max-w-[36rem] space-y-3 text-base leading-[1.7] text-foreground" data-hadith-translation>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <RichText text={p} />
        </p>
      ))}
    </div>
  );
}

/** One collection the hadith is in: "Sahih al-Bukhari 1", then its numbering and narrator, quietly */
function SourceCitation({ citation }: { citation: Citation }) {
  const url = sunnahComUrl(citation);
  const name = `${collectionName(citation.collection)} ${citation.number}`;
  const detail = [numberingLabel(citation.numbering), citation.book, citation.narrator && `narrated by ${citation.narrator}`].filter(Boolean).join(' · ');
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0" data-citation>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
        {citation.altNumbers && citation.altNumbers.length > 0 && (
          <p className="text-xs leading-relaxed text-muted">
            Also numbered {citation.altNumbers.map((a) => `${a.number} (${numberingLabel(a.numbering)})`).join(', ')}
          </p>
        )}
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => openExternal(url, e)}
          className="pressable -mr-2.5 -mt-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-teal transition-colors hover:bg-teal/5"
          aria-label={`${name} on Sunnah.com`}
          title="Open on Sunnah.com"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 4h6v6" />
            <path d="M20 4 10 14" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
      )}
    </div>
  );
}

/** Where it comes from and how it is graded, in one quiet panel */
function Source({ item }: { item: TextItem }) {
  const { citations, inSahih, gradings } = sourceRows(item);
  return (
    <Section title="Source" className="pt-2">
      <div className="divide-y divide-foreground/5 rounded-xl bg-foreground/[0.03] px-4 py-3">
        {citations.map((c) => (
          <SourceCitation key={`${c.collection}-${c.number}`} citation={c} />
        ))}
        {(inSahih.length > 0 || gradings.length > 0) && (
          <div className="space-y-1.5 py-2.5 first:pt-0 last:pb-0">
            {inSahih.length > 0 && (
              <p className="text-[13px] leading-relaxed text-muted" data-grading="in-sahih">
                {inSahihLine(inSahih)}
              </p>
            )}
            {gradings.map((g, i) => (
              <GradingLine key={`${g.by}-${i}`} grading={g} />
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

function Actions({ item }: { item: TextItem }) {
  const state = useItemState(NAWAWI_DECK, item.id);
  const hasRecall = useDeenStore((s) => Boolean(s.cards[`${NAWAWI_DECK}:${item.id}:recall`]));
  const hasMeaning = useDeenStore((s) => Boolean(s.cards[`${NAWAWI_DECK}:${item.id}:meaning`]));
  const ids = [hasRecall && `${NAWAWI_DECK}:${item.id}:recall`, hasMeaning && `${NAWAWI_DECK}:${item.id}:meaning`].filter(Boolean) as string[];
  const { memorise, memoriseLabel, offerMeaning } = learnActions(ids, item.id);
  const due = state === 'due';
  const memoriseHref = learnHref(NAWAWI_DECK, item.id, 'arabic');

  // One tactile button at most; everything after it is quiet
  let memoriseLink: ReactNode;
  if (memorise === 'again') {
    memoriseLink = (
      <Link href={memoriseHref} className={QUIET_LINK} data-start-memorising>
        {memoriseLabel}
      </Link>
    );
  } else if (due) {
    memoriseLink = (
      <Link
        href={memoriseHref}
        className="pressable flex min-h-11 items-center justify-center rounded-xl border border-foreground/10 bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
        data-start-memorising
      >
        {memoriseLabel}
      </Link>
    );
  } else {
    memoriseLink = (
      <Link href={memoriseHref} className="tactile-btn flex min-h-12 items-center justify-center rounded-xl bg-teal px-5 font-semibold text-on-teal" data-start-memorising>
        {memoriseLabel}
      </Link>
    );
  }

  return (
    <div className="space-y-3" data-hadith-actions>
      {due && (
        <Link href={sessionHref(NAWAWI_DECK)} className="tactile-btn flex min-h-12 items-center justify-center rounded-xl bg-teal px-5 font-semibold text-on-teal">
          Review it now
        </Link>
      )}
      {!due && memorise === 'again' && (
        <p className="px-2 pt-1 text-center text-sm leading-relaxed text-muted" data-hadith-settled>
          {state === 'strong' ? 'You know this one. It will come back in Review.' : 'This one is in your reviews. It comes back when it is due.'}
        </p>
      )}
      {memoriseLink}
      {offerMeaning && (
        <Link href={learnHref(NAWAWI_DECK, item.id, 'meaning')} className={cn(QUIET_LINK, '!mt-1')} data-learn-meaning>
          Just learn the meaning
        </Link>
      )}
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

      <Card variant="tactile" className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
        <HadithArabic item={item} />
        <div aria-hidden className="mx-auto h-px w-16 bg-gold/40" />
        <HadithTranslation item={item} />
      </Card>

      <Actions item={item} />

      <Source item={item} />

      {item.variants && item.variants.length > 0 && (
        <Section title="Another wording">
          {item.variants.map((v, i) => (
            <div key={i} className="space-y-2 rounded-xl bg-foreground/[0.03] px-4 py-3">
              <p dir="rtl" lang="ar" className="arabic-text text-xl text-foreground" style={{ lineHeight: 2, textAlign: 'center', textWrap: 'balance' }}>
                {v.arabic}
              </p>
              <p className="text-sm text-foreground">
                <RichText text={v.label} />
              </p>
              <div className="divide-y divide-foreground/5 border-t border-foreground/5 pt-2.5">
                {v.citations.map((c) => (
                  <SourceCitation key={`${c.collection}-${c.number}`} citation={c} />
                ))}
              </div>
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
          <Link href={hadithHref(prev.id)} className="pressable flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-teal transition-colors hover:bg-teal/5">
            <ChevronLeftIcon size={14} />
            <span className="truncate">Hadith {hadithNumber(prev.id)}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={hadithHref(next.id)}
            className="pressable flex min-h-11 items-center justify-end gap-1 rounded-xl px-2 text-sm font-semibold text-teal transition-colors hover:bg-teal/5"
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

const NOT_SHOWN = {
  failed: { title: 'This hadith could not be loaded', body: null, link: 'See all the hadith' },
  'no-such': {
    title: 'There is no hadith with that number',
    body: `Al-Nawawi's collection has ${NAWAWI_TOTAL}, numbered 1 to ${NAWAWI_TOTAL}.`,
    link: 'See all the hadith',
  },
  'not-yet': {
    title: "This hadith isn't here yet",
    body: 'Each one appears once its text, translation and source have been checked.',
    link: 'See the hadith that are ready',
  },
} as const;

/** The calm card for a hadith that cannot be shown, with the one thing that helps */
function NotShown({ kind }: { kind: keyof typeof NOT_SHOWN }) {
  const copy = NOT_SHOWN[kind];
  return (
    <div data-hadith-missing={kind}>
      <Card className="space-y-3 text-center">
        <p className="font-semibold text-foreground">{copy.title}</p>
        {copy.body && <p className="text-sm text-muted [text-wrap:balance]">{copy.body}</p>}
        {kind === 'failed' && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="tactile-btn mx-auto flex min-h-11 items-center justify-center rounded-xl bg-teal px-6 text-sm font-semibold text-on-teal"
          >
            Try again
          </button>
        )}
        <Link href="/hadith" className="inline-flex min-h-11 items-center font-semibold text-teal">
          {copy.link}
        </Link>
      </Card>
    </div>
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
  // A failed load, a number al-Nawawi never gave, and one still being checked each say so plainly
  if (deck.status === 'missing') return <NotShown kind="failed" />;
  if (!id) return <NotShown kind="no-such" />;
  const item = deck.items.find((it) => it.id === id);
  if (!item) return <NotShown kind="not-yet" />;
  return <Found item={item} items={deck.items} />;
}
