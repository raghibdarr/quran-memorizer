'use client';

import { useEffect, useRef } from 'react';
import Link from '@/components/app-link';
import BottomSheet from '@/components/ui/bottom-sheet';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { ReviewBadge } from '@/components/deen/review-badge';
import { ReportProblem } from '@/components/deen/report-problem';
import { ITEM_STATE_LABEL, type ItemState } from '@/components/deen/item-state';
import { ItemArabic } from '@/components/deen/cue-text';
import { cn } from '@/lib/cn';
import type { NameItem } from '@/types/deen';
import { EVIDENCE_LABEL, readerHref, refLabel } from './names-logic';
import { withHonorific } from './honorific';
import { StateMark } from './state-mark';

interface NameSheetProps {
  item: NameItem | null;
  state: ItemState;
  open: boolean;
  onClose: () => void;
  /** Adds this one Name to the learner's reviews */
  onLearn: (item: NameItem) => void;
  /** Surah names by id, for the reference chips (absent while loading) */
  surahNames?: Record<number, string>;
  /** Walk the list in order from inside the sheet (absent at either end) */
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * One Name: the Arabic, how to say it, what it means, where it comes from (with
 * each ayah opening the reader), the review status, and a way to report a problem.
 * Previous and next walk the list in order without closing the sheet.
 */
export function NameSheet({ item, state, open, onClose, onLearn, surahNames, onPrev, onNext }: NameSheetProps) {
  return (
    <BottomSheet open={open && !!item} onClose={onClose} title={item ? `${item.transliteration}: ${item.meaning}` : 'Name'} titleHidden>
      {item && <NameDetails item={item} state={state} onLearn={() => onLearn(item)} surahNames={surahNames} onPrev={onPrev} onNext={onNext} />}
    </BottomSheet>
  );
}

/** The scrolling box the sheet's content sits in */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

function StepButton({ dir, onClick }: { dir: 'prev' | 'next'; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={dir === 'prev' ? 'Previous Name' : 'Next Name'}
      className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-teal hover:bg-foreground/[0.05] disabled:pointer-events-none disabled:opacity-25"
      data-name-step={dir}
    >
      <ChevronLeftIcon size={18} className={cn(dir === 'next' && 'rotate-180')} />
    </button>
  );
}

function NameDetails({
  item,
  state,
  onLearn,
  surahNames,
  onPrev,
  onNext,
}: {
  item: NameItem;
  state: ItemState;
  onLearn: () => void;
  surahNames?: Record<number, string>;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const ev = item.evidence;
  const label = EVIDENCE_LABEL[ev.kind];
  const src = item.explanationSource;
  const rootRef = useRef<HTMLDivElement>(null);

  // A new Name starts at its top
  useEffect(() => {
    scrollParent(rootRef.current)?.scrollTo({ top: 0 });
  }, [item.id]);

  // Said once: a hadith whose evidence line already gives the reference, or the
  // list itself (cited inside the evidence box for a list-only Name)
  const sourceInEvidence = !!src && ((ev.kind === 'hadith' && !!ev.hadith?.startsWith(src.work)) || ev.kind === 'list-only');

  return (
    <div ref={rootRef} className="space-y-5 pb-2" data-name-sheet={item.id}>
      <div className="text-center">
        <div className="flex items-center justify-between gap-2">
          <StepButton dir="prev" onClick={onPrev} />
          <p className="text-[11px] font-semibold uppercase tabular-nums tracking-wide text-muted">{item.order} of 99</p>
          <StepButton dir="next" onClick={onNext} />
        </div>
        <ItemArabic text={item.arabic} className="text-[2.75rem] leading-[2.05]! text-teal" />
        <p className="text-xl font-bold text-foreground">{item.transliteration}</p>
        <p className="mt-1 text-base font-medium text-foreground">{item.meaning}</p>
        <span aria-hidden className="mx-auto mt-4 block h-px w-10 bg-gold/50" />
      </div>

      {item.explanation && (
        <div className="space-y-1.5">
          <p className="text-[15px] leading-7 text-foreground/90">{withHonorific(item.explanation)}</p>
          {src && !sourceInEvidence && (
            <p className="text-xs text-muted">
              Source: {src.work}, {src.location}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2.5 rounded-2xl bg-foreground/[0.04] px-4 py-3.5" data-evidence={ev.kind}>
        <p className={cn('text-sm font-semibold', ev.kind === 'list-only' ? 'text-gold-deep' : 'text-foreground')}>{withHonorific(label.long)}</p>
        {ev.form && (
          <p className="text-sm text-muted">
            The word in the ayah:{' '}
            <span className="arabic-text text-xl text-foreground" lang="ar" dir="rtl">
              {ev.form}
            </span>
          </p>
        )}
        {ev.hadith && <p className="text-sm leading-relaxed text-muted">{withHonorific(ev.hadith)}</p>}
        {ev.kind === 'list-only' && (
          <div className="space-y-1">
            <p className="text-sm leading-relaxed text-muted">It is taught here because it is part of the list people memorise.</p>
            {src && (
              <p className="text-xs leading-relaxed text-muted" data-list-source>
                {src.work}, {src.location}
              </p>
            )}
          </div>
        )}
        {(ev.quran ?? []).length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Read the ayat">
            {ev.quran!.map((r) => (
              <li key={refLabel(r)}>
                <Link
                  href={readerHref(r)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-foreground/15 bg-card px-3.5 text-sm font-semibold text-teal hover:border-teal/40"
                  data-quran-ref={refLabel(r)}
                >
                  {surahNames?.[r.surahId] ? `${surahNames[r.surahId]} ` : ''}
                  <span className="tabular-nums">{refLabel(r)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state === 'new' && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted" data-name-state={state}>
            {ITEM_STATE_LABEL[state]}
          </span>
          <button type="button" onClick={onLearn} className="tactile-btn min-h-11 rounded-xl bg-teal px-4 text-sm font-semibold text-on-teal hover:bg-teal-light" data-learn-name>
            Learn this Name
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/10 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {state !== 'new' && (
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-xs font-medium text-muted" data-name-state={state}>
              <StateMark state={state} />
              {ITEM_STATE_LABEL[state]}
            </span>
          )}
          <ReviewBadge review={item.review} />
        </div>
        <ReportProblem itemId={`names99:${item.id}`} rev={item.rev} title={item.transliteration} />
      </div>
    </div>
  );
}

export default NameSheet;
