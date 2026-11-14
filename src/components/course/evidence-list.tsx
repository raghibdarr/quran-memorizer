'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/app-link';
import ArabicText from '@/components/ui/arabic-text';
import TranslationText from '@/components/ui/translation-text';
import { CitationLine } from '@/components/deen/citation-line';
import { GradingLine } from '@/components/deen/grading-line';
import { ItemArabic } from '@/components/deen/cue-text';
import { RichText } from '@/components/deen/term';
import { ReviewBadge } from '@/components/deen/review-badge';
import { collectionName, workTitle } from '@/components/deen/registry-names';
import { getSurah } from '@/lib/quran-data';
import { listenHref } from '@/lib/routes';
import { evidenceKind, quranLabel } from '@/lib/course/lesson';
import { cn } from '@/lib/cn';
import type { Ayah } from '@/types/quran';
import type { Claim, ClaimEvidence, QuranRef, TextItem } from '@/types/deen';
import { resolveEvidenceItem } from './course-data';

type ItemState = { ref: string; item: TextItem | null; loaded: boolean };

/** Resolves every item ref of a claim once, for chip labels and panels */
function useEvidenceItems(evidence: ClaimEvidence[]): Map<string, ItemState> {
  const refs = evidence.flatMap((e) => ('item' in e ? [e.item] : []));
  const key = refs.join('|');
  const [state, setState] = useState<Map<string, ItemState>>(new Map());
  useEffect(() => {
    if (!key) return;
    let live = true;
    Promise.all(key.split('|').map(async (ref) => ({ ref, item: await resolveEvidenceItem(ref), loaded: true }))).then((all) => {
      if (live) setState(new Map(all.map((s) => [s.ref, s])));
    });
    return () => {
      live = false;
    };
  }, [key]);
  return state;
}

function chipLabel(e: ClaimEvidence, items: Map<string, ItemState>): { kind: string; text: string } {
  if ('quran' in e) return { kind: 'Quran', text: quranLabel(e.quran).replace(/^Quran /, '') };
  if ('item' in e) {
    const c = items.get(e.item)?.item?.citations[0];
    return { kind: 'Hadith', text: c ? `${collectionName(c.collection)} ${c.number}` : '' };
  }
  return { kind: 'Agreement', text: workTitle(e.consensus.work) };
}

function QuranPanel({ quran: q }: { quran: QuranRef }) {
  const [ayahs, setAyahs] = useState<Ayah[] | null | 'error'>(null);
  useEffect(() => {
    let live = true;
    getSurah(q.surahId)
      .then((s) => {
        const end = q.ayahEnd ?? q.ayah;
        if (live) setAyahs(s.ayahs.filter((a) => a.number >= q.ayah && a.number <= end));
      })
      .catch(() => live && setAyahs('error'));
    return () => {
      live = false;
    };
  }, [q.surahId, q.ayah, q.ayahEnd]);

  return (
    <div className="space-y-3">
      {ayahs === null && <p className="py-3 text-center text-sm text-muted">Loading the ayah…</p>}
      {ayahs === 'error' && <p className="text-sm text-muted">The ayah couldn’t be loaded here. It opens in the reader.</p>}
      {Array.isArray(ayahs) &&
        ayahs.map((a) => (
          <div key={a.key} className="space-y-1.5">
            <ArabicText ayah={a} className="text-[1.45rem] text-foreground" />
            <TranslationText ayah={a} className="text-sm leading-relaxed text-foreground" />
          </div>
        ))}
      <Link
        href={`${listenHref(q.surahId)}&a=${q.ayah}`}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-teal"
        data-open-reader
      >
        Open {quranLabel(q)} in the reader <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function ItemPanel({ state }: { state: ItemState | undefined }) {
  if (!state?.loaded) return <p className="py-3 text-center text-sm text-muted">Loading…</p>;
  const item = state.item;
  if (!item) {
    return <p className="text-sm leading-relaxed text-muted">This hadith’s text and reference aren’t in the app yet.</p>;
  }
  return (
    <div className="space-y-3" data-evidence-item={item.id}>
      <p className="text-sm font-semibold text-foreground">{item.title}</p>
      {item.arabic && <ItemArabic text={item.arabic} className="text-[1.45rem]" />}
      {item.translation && (
        <p className="text-sm leading-relaxed text-foreground">
          <RichText text={item.translation} />
        </p>
      )}
      <div className="space-y-1.5 border-t border-foreground/10 pt-2.5">
        {item.citations.map((c, i) => (
          <CitationLine key={i} citation={c} />
        ))}
        {item.gradings.map((g, i) => (
          <GradingLine key={i} grading={g} />
        ))}
      </div>
      <ReviewBadge review={item.review} />
    </div>
  );
}

function ConsensusPanel({ e, claimKind }: { e: { consensus: { work: string; location: string } }; claimKind: Claim['kind'] }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed text-foreground" data-consensus>
      <p className="text-xs font-semibold text-muted">{claimKind === 'differs' ? 'The agreed part is recorded in' : 'Agreement on this is recorded in'}</p>
      <p className="font-semibold">{workTitle(e.consensus.work)}</p>
      <p className="text-muted">{e.consensus.location}</p>
    </div>
  );
}

/**
 * Where a claim comes from (spec 5.1): a chip per piece of evidence. A Quran ref
 * shows the ayah and opens the reader; a hadith shows its text and citation; an
 * agreement shows the work and where in it. One panel open at a time.
 */
export function EvidenceList({ evidence, claimKind }: { evidence: ClaimEvidence[]; claimKind: Claim['kind'] }) {
  const items = useEvidenceItems(evidence);
  const [open, setOpen] = useState<number | null>(null);
  if (!evidence.length) return null;
  const shown = open !== null ? evidence[open] : null;

  return (
    <div className="space-y-2" data-evidence>
      <p className="text-xs font-semibold text-muted">Where this comes from</p>
      <ul className="flex flex-wrap gap-2">
        {evidence.map((e, i) => {
          const { kind, text } = chipLabel(e, items);
          const isOpen = open === i;
          return (
            <li key={i}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`evidence-panel-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                data-evidence-chip={evidenceKind(e)}
                className={cn(
                  'inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-left text-xs transition-colors',
                  isOpen ? 'border-teal/50 bg-teal/10 text-foreground' : 'border-foreground/15 bg-card text-foreground hover:bg-foreground/[0.04]',
                )}
              >
                <span className="shrink-0 font-semibold text-teal">{kind}</span>
                {text && <span className="truncate">{text}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {shown && (
        <div id={`evidence-panel-${open}`} className="animate-[phase-in_200ms_ease-out] rounded-xl border border-foreground/10 bg-card px-4 py-3" data-evidence-panel={evidenceKind(shown)}>
          {'quran' in shown && <QuranPanel quran={shown.quran} />}
          {'item' in shown && <ItemPanel state={items.get(shown.item)} />}
          {'consensus' in shown && <ConsensusPanel e={shown} claimKind={claimKind} />}
        </div>
      )}
    </div>
  );
}

export default EvidenceList;
