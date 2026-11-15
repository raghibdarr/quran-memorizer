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
import { consensusChipKind, groupEvidence, quranLabel, type EvidenceGroup } from '@/lib/course/lesson';
import { cn } from '@/lib/cn';
import { ChevronDownIcon } from '@/components/ui/icons';
import type { Ayah } from '@/types/quran';
import type { Claim, ClaimEvidence, QuranRef, TextItem } from '@/types/deen';
import { resolveEvidenceItem } from './course-data';

type ItemState = { ref: string; item: TextItem | null; loaded: boolean };

/** Resolves every item ref of a claim once, for chip labels and panels */
function useEvidenceItems(groups: EvidenceGroup[]): Map<string, ItemState> {
  const refs = groups.flatMap((g) => (g.kind === 'item' ? [g.item] : []));
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

function chipLabel(g: EvidenceGroup, items: Map<string, ItemState>, claimKind: Claim['kind']): { kind: string; text: string } {
  if (g.kind === 'quran') return { kind: 'Quran', text: quranLabel(g.quran).replace(/^Quran /, '') };
  if (g.kind === 'item') {
    const c = items.get(g.item)?.item?.citations[0];
    return { kind: 'Hadith', text: c ? `${collectionName(c.collection)} ${c.number}` : '' };
  }
  return { kind: consensusChipKind(claimKind), text: workTitle(g.work) };
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
          <div key={a.key} className="space-y-3">
            <ArabicText ayah={a} className="text-[1.45rem] leading-[2.2] text-foreground" />
            {/* Negative margins let a footnote number keep its 24px tap area without opening up its line */}
            <TranslationText ayah={a} className="border-t border-foreground/[0.07] pt-3 text-sm leading-relaxed text-foreground [&_[data-footnote]]:-my-1.5" />
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

function ConsensusPanel({ work, locations, claimKind }: { work: string; locations: string[]; claimKind: Claim['kind'] }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed text-foreground" data-consensus>
      <p className="text-xs font-semibold text-muted">{claimKind === 'differs' ? 'The agreed part is recorded in' : 'Agreement on this is recorded in'}</p>
      <p className="font-semibold">{workTitle(work)}</p>
      {locations.length === 1 ? (
        <p className="text-muted">{locations[0]}</p>
      ) : (
        <ul className="space-y-0.5 text-muted">
          {locations.map((l) => (
            <li key={l} className="flex gap-2">
              <span aria-hidden>·</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Where a claim comes from (spec 5.1): a chip per piece of evidence. A Quran ref
 * shows the ayah and opens the reader; a hadith shows its text and citation; an
 * agreement shows the work and where in it (two places in one work share a
 * chip). One panel open at a time. A hadith the app can't open yet is a plain
 * note, never a chip that leads nowhere.
 */
export function EvidenceList({ evidence, claimKind, hint = false }: { evidence: ClaimEvidence[]; claimKind: Claim['kind']; hint?: boolean }) {
  const groups = groupEvidence(evidence);
  const items = useEvidenceItems(groups);
  const [open, setOpen] = useState<number | null>(null);
  if (!groups.length) return null;
  const shown = open !== null ? groups[open] : null;
  const unresolved = (g: EvidenceGroup) => g.kind === 'item' && items.get(g.item)?.loaded === true && !items.get(g.item)?.item;

  return (
    <div className="space-y-2" data-evidence>
      <p className="text-xs font-semibold text-muted">
        Where this comes from{hint && <span className="font-normal"> · tap to open</span>}
      </p>
      <ul className="flex flex-wrap gap-2">
        {groups.map((g, i) => {
          const { kind, text } = chipLabel(g, items, claimKind);
          if (unresolved(g)) {
            return (
              <li key={i} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-dashed border-foreground/15 px-3 text-xs text-muted" data-evidence-pending>
                <span className="shrink-0 font-semibold">{kind}</span>
                <span>reference to come</span>
              </li>
            );
          }
          const isOpen = open === i;
          return (
            <li key={i}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={isOpen ? `evidence-panel-${i}` : undefined}
                onClick={() => setOpen(isOpen ? null : i)}
                data-evidence-chip={g.kind}
                className={cn(
                  'inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border pr-2 pl-3 text-left text-xs transition-colors',
                  isOpen ? 'border-teal/50 bg-teal/10 text-foreground' : 'border-foreground/15 bg-card text-foreground hover:bg-foreground/[0.04]',
                )}
              >
                <span className="shrink-0 font-semibold text-teal">{kind}</span>
                {text && <span className="truncate">{text}</span>}
                <ChevronDownIcon size={14} className={cn('shrink-0 text-muted transition-transform motion-reduce:transition-none', isOpen && 'rotate-180')} />
              </button>
            </li>
          );
        })}
      </ul>
      {shown && !unresolved(shown) && (
        <div id={`evidence-panel-${open}`} className="animate-[phase-in_200ms_ease-out] rounded-xl border border-foreground/10 bg-card px-4 py-3" data-evidence-panel={shown.kind}>
          {shown.kind === 'quran' && <QuranPanel quran={shown.quran} />}
          {shown.kind === 'item' && <ItemPanel state={items.get(shown.item)} />}
          {shown.kind === 'consensus' && <ConsensusPanel work={shown.work} locations={shown.locations} claimKind={claimKind} />}
        </div>
      )}
    </div>
  );
}

export default EvidenceList;
