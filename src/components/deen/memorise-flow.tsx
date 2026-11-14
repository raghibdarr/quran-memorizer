'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DeckDepth, DeckKind, TextItem } from '@/types/deen';
import type { Ayah } from '@/types/quran';
import { getSurah } from '@/lib/quran-data';
import { cardId, cardsForItem, newDeenCard } from '@/lib/deen/cards';
import { useDeenStore, type DeenCard } from '@/stores/deen-store';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { ayahRange } from '@/lib/ayah-range';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import Button from '@/components/ui/button';
import RatingButtons, { type Rating } from '@/components/ui/rating-buttons';
import ArabicText from '@/components/ui/arabic-text';
import TranslationText from '@/components/ui/translation-text';
import HintAyah from '@/components/ui/hint-ayah';
import { CitationLine } from './citation-line';
import { GradingLine } from './grading-line';
import { ReviewBadge } from './review-badge';
import { RichText } from './term';
import { CueText, ItemArabic } from './cue-text';
import { deckKindOf } from './deck-source';
import { workTitle } from './registry-names';
import { splitSegments } from './text';

/** Self-rating to SM-2 quality, as in the Quran reviews */
export const RATING_QUALITY: Record<Rating, number> = { 'got-it': 5, hesitated: 3, missed: 1 };

/** How many times a part is read aloud, text in view, before it is hidden */
export const READ_REPS = 3;

export interface MemoriseResult {
  /** Deen card ids added (existing cards are kept as they were) */
  cardIds: string[];
  /** Quran ayahs handed to the normal ayah review instead */
  ayahs: number;
  rating: Rating;
}

/**
 * The cards learning an item adds (spec 5.7): with "Know the meaning" only the
 * meaning card; with "Memorise the Arabic" every facet the item has. Quranic
 * items add none here: their ayahs join the normal Quran review.
 */
export function cardsForMemorise(deck: string, kind: DeckKind, item: TextItem, depth: DeckDepth, now = Date.now()): Record<string, DeenCard> {
  if (item.quran) return {};
  if (depth === 'meaning') {
    return item.translation ? { [cardId(deck, item.id, 'meaning')]: newDeenCard(deck, item.rev, now) } : {};
  }
  return cardsForItem(deck, kind, item, { depth, school: null, now });
}

type Step = 'read' | 'build' | 'recall' | 'done';
type Stage = 'read' | 'cue' | 'hidden' | 'check';

/** One unit of the Build step: a segment, or the chain of all of them */
interface Unit {
  label: string;
  /** Text items: the Arabic of this unit */
  text?: string;
  /** Quran items: the ayahs of this unit */
  ayahs?: Ayah[];
}

function useQuranAyahs(item: TextItem): { ayahs: Ayah[] | null; surahName: string } {
  const [state, setState] = useState<{ ayahs: Ayah[] | null; surahName: string }>({ ayahs: null, surahName: '' });
  const ref = item.quran;
  useEffect(() => {
    if (!ref) return;
    let live = true;
    getSurah(ref.surahId).then((s) => {
      if (!live) return;
      const end = ref.ayahEnd ?? ref.ayah;
      setState({ ayahs: s.ayahs.filter((a) => a.number >= ref.ayah && a.number <= end), surahName: s.nameSimple });
    });
    return () => {
      live = false;
    };
  }, [ref]);
  return state;
}

function StepDots({ step, depth }: { step: Step; depth: DeckDepth }) {
  const steps: { id: Step; label: string }[] =
    depth === 'meaning'
      ? [{ id: 'read', label: 'Read' }, { id: 'recall', label: 'Recall' }]
      : [{ id: 'read', label: 'Read' }, { id: 'build', label: 'Build' }, { id: 'recall', label: 'Recall' }];
  const at = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center justify-center gap-2 text-xs" aria-label="Steps">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="h-px w-5 bg-foreground/15" />}
          <span
            aria-current={s.id === step ? 'step' : undefined}
            className={cn(
              'rounded-full px-2.5 py-1 font-semibold',
              s.id === step ? 'bg-teal text-on-teal' : i < at || step === 'done' ? 'text-teal' : 'text-muted',
            )}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The whole text of an item, Arabic plus English, for the Read step and the recall check */
function ItemText({ item, ayahs, showEnglish = true }: { item: TextItem; ayahs: Ayah[] | null; showEnglish?: boolean }) {
  if (item.quran) {
    if (!ayahs) return <p className="py-8 text-center text-sm text-muted">Loading the ayahs…</p>;
    return (
      <div className="space-y-4">
        {ayahs.map((a) => (
          <div key={a.key} className="space-y-1.5">
            <ArabicText ayah={a} className="text-[1.65rem]" />
            {showEnglish && <TranslationText ayah={a} className="text-sm leading-relaxed text-foreground" />}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {item.arabic && <ItemArabic text={item.arabic} />}
      {showEnglish && item.translation && (
        <p className="text-[15px] leading-relaxed text-foreground">
          <RichText text={item.translation} />
        </p>
      )}
    </div>
  );
}

function UnitView({ unit, stage }: { unit: Unit; stage: Stage }) {
  if (stage === 'hidden') {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-xl border-[1.5px] border-dashed border-foreground/20 px-4 text-center text-sm text-muted">
        Say it from memory, then check.
      </div>
    );
  }
  if (unit.ayahs) {
    return (
      <div className="space-y-3">
        {unit.ayahs.map((a) => (stage === 'cue' ? <HintAyah key={a.key} ayah={a} className="text-2xl" /> : <ArabicText key={a.key} ayah={a} className="text-[1.65rem]" />))}
      </div>
    );
  }
  if (!unit.text) return null;
  return stage === 'cue' ? <CueText text={unit.text} className="text-[1.65rem]" /> : <ItemArabic text={unit.text} />;
}

/**
 * Learning one item (spec 2.7): Read (Arabic, our translation, citation,
 * grading, notes) → Build (part by part: read it aloud with the text, then with
 * first-letter cues, then from memory; then the parts chained) → Recall and
 * self-rate → its cards join the review queue. "Know the meaning" skips Build
 * and adds only the meaning card. Items with a Quran ref render from the surah
 * files and hand their ayahs to the normal Quran review.
 */
export function MemoriseFlow({
  item,
  depth,
  onDone,
  kind,
}: {
  item: TextItem;
  depth: DeckDepth;
  onDone: (result: MemoriseResult) => void;
  /** The deck's kind, when the host knows it (else looked up from item.deck) */
  kind?: DeckKind;
}) {
  const deckKind: DeckKind = kind ?? deckKindOf(item.deck) ?? 'hadith';
  const { ayahs, surahName } = useQuranAyahs(item);
  const addCards = useDeenStore((s) => s.addCards);
  const addAyahCard = useReviewStore((s) => s.addCard);
  const recordActivity = useStatsStore((s) => s.recordActivity);

  const [step, setStep] = useState<Step>('read');
  const [unitIndex, setUnitIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('read');
  const [reps, setReps] = useState(0);
  const [showTranslit, setShowTranslit] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState<MemoriseResult | null>(null);

  // Build units: each authored segment (or each ayah), then the chain when there are several
  const units = useMemo<Unit[]>(() => {
    const parts: Unit[] = item.quran
      ? (ayahs ?? []).map((a) => ({ label: `Ayah ${a.number}`, ayahs: [a] }))
      : splitSegments(item.arabic ?? '', item.segments).map((text, i) => ({ label: `Part ${i + 1}`, text }));
    if (parts.length <= 1) return parts.map((p) => ({ ...p, label: 'The whole text' }));
    const chain: Unit = item.quran ? { label: 'All together', ayahs: ayahs ?? [] } : { label: 'All together', text: parts.map((p) => p.text).join(' ') };
    return [...parts, chain];
  }, [item, ayahs]);

  const meaningOnly = depth === 'meaning';
  const canBuild = !meaningOnly && (item.quran ? !!ayahs?.length : !!item.arabic);

  const finish = (rating: Rating) => {
    const deck = item.deck;
    let ayahCount = 0;
    if (item.quran && ayahs) {
      for (const a of ayahs) addAyahCard(item.quran.surahId, a.number);
      ayahCount = ayahs.length;
    }
    const fresh = cardsForMemorise(deck, deckKind, item, depth);
    addCards(fresh);
    recordActivity();
    haptic.success();
    setResult({ cardIds: Object.keys(fresh), ayahs: ayahCount, rating });
    setStep('done');
  };

  const startUnit = (i: number) => {
    setUnitIndex(i);
    setStage(i === units.length - 1 && units.length > 1 ? 'cue' : 'read');
    setReps(0);
  };

  const top = (
    <div className="space-y-1 text-center">
      <h2 className="text-lg font-bold text-foreground">{item.title}</h2>
      {item.quran && surahName && (
        <p className="text-xs text-muted">
          {surahName} · {ayahRange(item.quran.ayah, item.quran.ayahEnd ?? item.quran.ayah)}
        </p>
      )}
    </div>
  );

  // ---------- Read ----------
  if (step === 'read') {
    return (
      <div className="space-y-5" data-memorise-step="read">
        <StepDots step="read" depth={depth} />
        {top}
        <div className="tactile-card space-y-4 rounded-2xl bg-card p-5">
          <ItemText item={item} ayahs={ayahs} />
          {item.transliteration && (
            <div>
              <button type="button" onClick={() => setShowTranslit((s) => !s)} aria-expanded={showTranslit} className="min-h-9 text-xs font-semibold text-teal">
                {showTranslit ? 'Hide transliteration' : 'Show transliteration'}
              </button>
              {showTranslit && <p className="text-sm italic leading-relaxed text-muted">{item.transliteration}</p>}
            </div>
          )}
          {item.usage && item.usage.when.length > 0 && (
            <div className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 text-sm text-foreground">
              <p className="text-xs font-semibold text-muted">When it is said</p>
              <ul className="mt-1 space-y-0.5">
                {item.usage.when.map((w) => (
                  <li key={w}>
                    <RichText text={w} />
                  </li>
                ))}
              </ul>
              {item.usage.repeat && item.usage.repeat > 1 && <p className="mt-1 text-xs text-muted">Said {item.usage.repeat} times</p>}
            </div>
          )}
        </div>

        {(item.citations.length > 0 || item.gradings.length > 0) && (
          <div className="space-y-2 px-1">
            {item.citations.map((c, i) => (
              <CitationLine key={i} citation={c} />
            ))}
            {item.gradings.map((g, i) => (
              <GradingLine key={i} grading={g} />
            ))}
          </div>
        )}

        {item.notes && item.notes.length > 0 && (
          <div className="space-y-2 px-1">
            <p className="text-xs font-semibold text-muted">Notes</p>
            {item.notes.map((n, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground">
                <RichText text={n.text} />{' '}
                <span className="text-xs text-muted">
                  ({workTitle(n.source.work)}, {n.source.location})
                </span>
              </p>
            ))}
          </div>
        )}

        <ReviewBadge review={item.review} />

        <Button
          className="w-full"
          disabled={item.quran ? !ayahs : false}
          onClick={() => {
            if (canBuild) {
              startUnit(0);
              setStep('build');
            } else setStep('recall');
          }}
        >
          {canBuild ? 'Start memorising' : 'I’ve read it, test me'}
        </Button>
      </div>
    );
  }

  // ---------- Build ----------
  if (step === 'build') {
    const unit = units[unitIndex];
    const isChain = units.length > 1 && unitIndex === units.length - 1;
    const nextUnit = () => {
      if (unitIndex + 1 < units.length) startUnit(unitIndex + 1);
      else {
        setRevealed(false);
        setHint(false);
        setStep('recall');
      }
    };
    return (
      <div className="space-y-5" data-memorise-step="build" data-unit={unitIndex}>
        <StepDots step="build" depth={depth} />
        {top}
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-semibold text-foreground">{unit.label}</span>
          <span>
            {Math.min(unitIndex + 1, units.length)} of {units.length}
          </span>
        </div>
        <div className="tactile-card rounded-2xl bg-card p-5">
          <UnitView unit={unit} stage={stage === 'check' ? 'read' : stage} />
        </div>

        {stage === 'read' && (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted">Read it aloud {READ_REPS} times, looking at the text.</p>
            <div className="flex justify-center gap-2" aria-hidden>
              {Array.from({ length: READ_REPS }, (_, i) => (
                <span key={i} className={cn('h-2.5 w-2.5 rounded-full', i < reps ? 'bg-teal' : 'bg-foreground/15')} />
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => {
                haptic.selection();
                const n = reps + 1;
                setReps(n);
                if (n >= READ_REPS) setStage('cue');
              }}
            >
              Read it once ({Math.min(reps + 1, READ_REPS)} of {READ_REPS})
            </Button>
          </div>
        )}
        {stage === 'cue' && (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted">
              {isChain ? 'Now all of it, with first letters only.' : 'Now say it with only the first letters.'} Tap a word if you need it.
            </p>
            <Button className="w-full" onClick={() => setStage('hidden')}>
              Hide it all
            </Button>
          </div>
        )}
        {stage === 'hidden' && (
          <Button className="w-full" onClick={() => setStage('check')}>
            I’ve said it, show me
          </Button>
        )}
        {stage === 'check' && (
          <div className="space-y-2">
            <p className="text-center text-sm text-muted">Did you have it?</p>
            <Button className="w-full" onClick={nextUnit}>
              {unitIndex + 1 < units.length ? 'Yes, next' : 'Yes, on to recall'}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStage('cue');
              }}
            >
              Not yet, go over it again
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ---------- Recall ----------
  if (step === 'recall') {
    return (
      <div className="space-y-5" data-memorise-step="recall">
        <StepDots step="recall" depth={depth} />
        {top}
        <div className="tactile-card space-y-4 rounded-2xl bg-card p-5 text-center">
          {meaningOnly ? (
            <>
              {item.arabic ? <ItemArabic text={item.arabic} /> : item.quran && ayahs ? <ItemText item={item} ayahs={ayahs} showEnglish={false} /> : <p className="text-sm text-muted">{item.cue}</p>}
              <p className="text-sm font-medium text-foreground">What does it mean? Say it in your own words.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Recite it from memory</p>
              <p className="text-xs text-muted">{item.cue}</p>
              {hint && !revealed &&
                (item.quran ? (ayahs ?? []).map((a) => <HintAyah key={a.key} ayah={a} className="text-2xl" />) : item.arabic && <CueText text={item.arabic} className="text-2xl" />)}
              {!hint && !revealed && (
                <button type="button" onClick={() => setHint(true)} className="min-h-11 rounded-full bg-foreground/[0.06] px-4 text-xs font-semibold text-foreground/80 hover:bg-foreground/10">
                  Hint: first letters
                </button>
              )}
            </>
          )}
          {revealed && (
            <div className="border-t border-foreground/10 pt-4 text-start">
              {meaningOnly ? (
                item.translation ? (
                  <p className="text-[15px] leading-relaxed text-foreground">
                    <RichText text={item.translation} />
                  </p>
                ) : (
                  <ItemText item={item} ayahs={ayahs} />
                )
              ) : (
                <ItemText item={item} ayahs={ayahs} showEnglish={false} />
              )}
            </div>
          )}
        </div>
        {revealed ? (
          <div className="space-y-2">
            <p className="text-center text-sm text-muted">How did it go?</p>
            <RatingButtons onRate={finish} />
          </div>
        ) : (
          <Button className="w-full" onClick={() => setRevealed(true)}>
            Show me
          </Button>
        )}
      </div>
    );
  }

  // ---------- Done ----------
  const n = result?.cardIds.length ?? 0;
  return (
    <div className="space-y-5 py-4 text-center" data-memorise-step="done">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
        <p className="mt-1 text-sm text-muted">
          {result?.ayahs
            ? `These ${result.ayahs === 1 ? 'ayah joins' : `${result.ayahs} ayahs join`} your Quran reviews.`
            : n > 0
              ? `${n} ${n === 1 ? 'card' : 'cards'} added. They come up in Review.`
              : 'Already in your reviews.'}
        </p>
        {result?.rating === 'missed' && <p className="mt-1 text-sm text-muted">It will come back soon, so it gets easier.</p>}
      </div>
      <div className="space-y-2">
        <Button className="w-full" onClick={() => result && onDone(result)}>
          Done
        </Button>
        {canBuild && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              startUnit(0);
              setStep('build');
            }}
          >
            Go through it again
          </Button>
        )}
      </div>
    </div>
  );
}

export default MemoriseFlow;
