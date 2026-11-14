'use client';

import Link from '@/components/app-link';
import BottomSheet from '@/components/ui/bottom-sheet';
import { ReviewBadge } from '@/components/deen/review-badge';
import { ReportProblem } from '@/components/deen/report-problem';
import { ITEM_STATE_LABEL, type ItemState } from '@/components/deen/item-state';
import { ItemArabic } from '@/components/deen/cue-text';
import { cn } from '@/lib/cn';
import type { NameItem } from '@/types/deen';
import { EVIDENCE_LABEL, readerHref, refLabel } from './names-logic';

interface NameSheetProps {
  item: NameItem | null;
  state: ItemState;
  open: boolean;
  onClose: () => void;
  /** Adds this one Name to the learner's reviews */
  onLearn: (item: NameItem) => void;
  /** Surah names by id, for the reference chips (absent while loading) */
  surahNames?: Record<number, string>;
}

/**
 * One Name: the Arabic, how to say it, what it means, where it comes from (with
 * each ayah opening the reader), the review status, and a way to report a problem.
 */
export function NameSheet({ item, state, open, onClose, onLearn, surahNames }: NameSheetProps) {
  return (
    <BottomSheet open={open && !!item} onClose={onClose} title={item ? `${item.transliteration}: ${item.meaning}` : 'Name'} titleHidden>
      {item && <NameDetails item={item} state={state} onLearn={() => onLearn(item)} surahNames={surahNames} />}
    </BottomSheet>
  );
}

function NameDetails({ item, state, onLearn, surahNames }: { item: NameItem; state: ItemState; onLearn: () => void; surahNames?: Record<number, string> }) {
  const ev = item.evidence;
  const label = EVIDENCE_LABEL[ev.kind];
  return (
    <div className="space-y-5 pb-2" data-name-sheet={item.id}>
      <div className="space-y-2 text-center">
        <p className="text-xs font-semibold tabular-nums text-muted">{item.order} of 99</p>
        <ItemArabic text={item.arabic} className="text-[2.5rem] text-teal" />
        <p className="text-lg font-bold text-foreground">{item.transliteration}</p>
        <p className="text-base text-foreground">{item.meaning}</p>
      </div>

      {item.explanation && (
        <div className="space-y-1.5">
          <p className="text-[15px] leading-relaxed text-foreground">{item.explanation}</p>
          {item.explanationSource && (
            <p className="text-xs text-muted">
              Source: {item.explanationSource.work}, {item.explanationSource.location}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2.5 rounded-2xl bg-foreground/[0.04] px-4 py-3.5" data-evidence={ev.kind}>
        <p className={cn('text-sm font-semibold', ev.kind === 'list-only' ? 'text-gold-deep' : 'text-foreground')}>{label.long}</p>
        {ev.form && (
          <p className="text-sm text-muted">
            The word in the ayah:{' '}
            <span className="arabic-text text-xl text-foreground" lang="ar" dir="rtl">
              {ev.form}
            </span>
          </p>
        )}
        {ev.hadith && <p className="text-sm leading-relaxed text-muted">{ev.hadith}</p>}
        {ev.kind === 'list-only' && (
          <p className="text-sm leading-relaxed text-muted">It is taught here because it is part of the list people memorise.</p>
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

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted" data-name-state={state}>
          {ITEM_STATE_LABEL[state]}
        </span>
        {state === 'new' && (
          <button type="button" onClick={onLearn} className="tactile-btn min-h-11 rounded-xl bg-teal px-4 text-sm font-semibold text-on-teal hover:bg-teal-light" data-learn-name>
            Learn this Name
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/10 pt-3">
        <ReviewBadge review={item.review} />
        <ReportProblem itemId={`names99:${item.id}`} rev={item.rev} title={item.transliteration} />
      </div>
    </div>
  );
}

export default NameSheet;
