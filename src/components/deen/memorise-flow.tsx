'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
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
import { learnParts } from './text';

/** Self-rating to SM-2 quality, as in the Quran reviews */
export const RATING_QUALITY: Record<Rating, number> = { 'got-it': 5, hesitated: 3, missed: 1 };

/** How many times a part is read aloud, text in view, before it is hidden */
export const READ_REPS = 3;

/**
 * After a step or stage changes, taps are ignored this long: the next action
 * often sits where the last one was, and a quick extra tap must not skip a
 * stage, reveal an answer or rate it.
 */
export const TAP_GUARD_MS = 400;

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

/** One unit of the Build step: a part, or the chain of all of them */
interface Unit {
  /** "Part 1 of 2", "All together"; empty when the text is learned whole */
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
    getSurah(ref.surahId)
      .then((s) => {
        if (!live) return;
        const end = ref.ayahEnd ?? ref.ayah;
        setState({ ayahs: s.ayahs.filter((a) => a.number >= ref.ayah && a.number <= end), surahName: s.nameSimple });
      })
      .catch(() => live && setState({ ayahs: [], surahName: '' }));
    return () => {
      live = false;
    };
  }, [ref]);
  return state;
}

/**
 * Ignores taps for TAP_GUARD_MS after each `move()`. While locked, guarded
 * controls carry aria-disabled (no visual change: the pause is too short to show).
 */
function useTapGuard() {
  const [moves, setMoves] = useState(0);
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setSettled(moves), TAP_GUARD_MS);
    return () => clearTimeout(t);
  }, [moves]);
  const locked = moves !== settled;
  const guard =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      if (!locked) fn(...args);
    };
  return { locked, move: () => setMoves((m) => m + 1), guard };
}

/** Moves focus to `ref` whenever `key` changes after the first render */
function useFocusOnChange(key: string, ref: RefObject<HTMLElement | null>) {
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    ref.current?.focus();
  }, [key, ref]);
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

/**
 * A Build unit in all its forms stacked in one grid cell (text, first-letter
 * cues, hidden), only one visible: the card is as tall as the tallest form, so
 * it and the button under it stay put from stage to stage.
 */
function UnitView({ unit, stage, attempt }: { unit: Unit; stage: Stage; attempt: number }) {
  const layer = stage === 'cue' ? 'cue' : stage === 'hidden' ? 'none' : 'text';
  const cell = 'col-start-1 row-start-1 flex items-center justify-center';
  const text = unit.ayahs ? (
    <div className="w-full space-y-3">
      {unit.ayahs.map((a) => (
        <ArabicText key={a.key} ayah={a} className="text-[1.65rem]" />
      ))}
    </div>
  ) : unit.text ? (
    <ItemArabic text={unit.text} />
  ) : null;
  const cue = unit.ayahs ? (
    <div className="w-full space-y-3">
      {unit.ayahs.map((a) => (
        <HintAyah key={a.key} ayah={a} className="text-2xl" />
      ))}
    </div>
  ) : unit.text ? (
    <CueText key={attempt} text={unit.text} />
  ) : null;
  return (
    <div className="grid min-h-28">
      <div className={cn(cell, layer !== 'text' && 'invisible')}>{text}</div>
      <div className={cn(cell, layer !== 'cue' && 'invisible')}>{cue}</div>
      {layer === 'none' && <div className={cn(cell, 'rounded-xl border-[1.5px] border-dashed border-foreground/20 px-4 text-center text-sm text-muted')}>Say it from memory</div>}
    </div>
  );
}

/** A quiet panel for the trust lines and notes under the text */
const PANEL = 'divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-card-raised px-4 py-3';
const PANEL_ROW = 'py-2.5 first:pt-0 last:pb-0';

/**
 * Learning one item (spec 2.7): Read (Arabic, our translation, citation,
 * grading, notes) → Build (part by part: read it aloud with the text, then with
 * first-letter cues, then from memory; then the parts chained) → Recall and
 * self-rate → its cards join the review queue. "Know the meaning" skips Build
 * and adds only the meaning card. Items with a Quran ref render from the surah
 * files and hand their ayahs to the normal Quran review. A long text with no
 * authored segments is split into even parts of about eight words.
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
  const [attempt, setAttempt] = useState(0);
  const [showTranslit, setShowTranslit] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState<MemoriseResult | null>(null);
  const { locked, move, guard } = useTapGuard();

  // Focus follows the flow: the heading on each new step, the answer when it is shown
  const headingRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  useFocusOnChange(step, headingRef);
  useFocusOnChange(step === 'recall' && revealed ? 'answer' : 'question', answerRef);

  // Build units: each part (authored, else automatic) or each ayah, then the chain when there are several
  const units = useMemo<Unit[]>(() => {
    const parts: Unit[] = item.quran
      ? (ayahs ?? []).map((a, i, all) => ({ label: `Ayah ${a.number} · ${i + 1} of ${all.length}`, ayahs: [a] }))
      : learnParts(item.arabic ?? '', item.segments).map((text, i, all) => ({ label: `Part ${i + 1} of ${all.length}`, text }));
    if (parts.length <= 1) return parts.map((p) => ({ ...p, label: '' }));
    const chain: Unit = item.quran ? { label: 'All together', ayahs: ayahs ?? [] } : { label: 'All together', text: parts.map((p) => p.text).join(' ') };
    return [...parts, chain];
  }, [item, ayahs]);

  const meaningOnly = depth === 'meaning';
  const canBuild = !meaningOnly && (item.quran ? !!ayahs?.length : !!item.arabic);
  const lock = locked || undefined;

  const finish = (rating: Rating) => {
    const deck = item.deck;
    let ayahCount = 0;
    // Ayahs join the Quran review only when the Arabic was memorised: "Know the
    // meaning" must not put recitation cards in front of someone who never learned them
    if (item.quran && ayahs && !meaningOnly) {
      for (const a of ayahs) addAyahCard(item.quran.surahId, a.number);
      ayahCount = ayahs.length;
    }
    // Only cards that don't exist yet are added (and counted): learning an item again keeps its progress
    const have = useDeenStore.getState().cards;
    const fresh = Object.fromEntries(Object.entries(cardsForMemorise(deck, deckKind, item, depth)).filter(([id]) => !have[id]));
    addCards(fresh);
    recordActivity();
    haptic.success();
    setResult({ cardIds: Object.keys(fresh), ayahs: ayahCount, rating });
    setStep('done');
    move();
  };

  const toStage = (s: Stage) => {
    setStage(s);
    move();
  };

  const startUnit = (i: number) => {
    setUnitIndex(i);
    setStage(i === units.length - 1 && units.length > 1 ? 'cue' : 'read');
    setReps(0);
    setAttempt((a) => a + 1);
    move();
  };

  const toRecall = () => {
    setRevealed(false);
    setHint(false);
    setStep('recall');
    move();
  };

  const top = (
    <div className="space-y-1 text-center">
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-foreground outline-none">
        {item.title}
      </h2>
      {item.quran && surahName && (
        <p className="text-xs text-muted">
          {surahName} · {ayahRange(item.quran.ayah, item.quran.ayahEnd ?? item.quran.ayah)}
        </p>
      )}
    </div>
  );

  // What a screen reader hears as the flow moves on (the visible text changes in place)
  let announce = '';
  let content: ReactNode;

  if (step === 'read') {
    // ---------- Read ----------
    content = (
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
          <div className={PANEL} data-trust-panel>
            {item.citations.map((c, i) => (
              <CitationLine key={i} citation={c} className={PANEL_ROW} />
            ))}
            {item.gradings.map((g, i) => (
              <GradingLine key={i} grading={g} className={PANEL_ROW} />
            ))}
          </div>
        )}

        {item.notes && item.notes.length > 0 && (
          <div className="space-y-1.5">
            <p className="px-1 text-xs font-semibold text-muted">Notes</p>
            <div className={PANEL}>
              {item.notes.map((n, i) => (
                <p key={i} className={cn(PANEL_ROW, 'text-sm leading-relaxed text-foreground')}>
                  <RichText text={n.text} />{' '}
                  <span className="text-xs text-muted">
                    ({workTitle(n.source.work)}, {n.source.location})
                  </span>
                </p>
              ))}
            </div>
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
            } else toRecall();
          }}
        >
          {canBuild ? 'Start memorising' : 'I’ve read it, test me'}
        </Button>
      </div>
    );
  } else if (step === 'build') {
    // ---------- Build ----------
    const unit = units[unitIndex];
    const isChain = units.length > 1 && unitIndex === units.length - 1;
    const hasNext = unitIndex + 1 < units.length;
    const help =
      stage === 'read'
        ? `Read it aloud ${READ_REPS} times, looking at the text.`
        : stage === 'cue'
          ? `${isChain ? 'Now all of it, with first letters only.' : 'Now say it with only the first letters.'} Tap a word if you need it.`
          : stage === 'check'
            ? 'Did you have it?'
            : '';
    const primary: { label: string; run: () => void } =
      stage === 'read'
        ? {
            label: 'I’ve read it aloud',
            run: () => {
              haptic.selection();
              const n = reps + 1;
              setReps(n);
              if (n >= READ_REPS) toStage('cue');
            },
          }
        : stage === 'cue'
          ? { label: 'Try it from memory', run: () => toStage('hidden') }
          : stage === 'hidden'
            ? { label: 'I’ve said it, show me', run: () => toStage('check') }
            : { label: hasNext ? 'Yes, next' : 'Yes, on to recall', run: () => (hasNext ? startUnit(unitIndex + 1) : toRecall()) };
    const where = unit.label || 'The whole text';
    announce =
      stage === 'read'
        ? reps === 0
          ? `${where}. Read it aloud ${READ_REPS} times.`
          : `Read ${reps} of ${READ_REPS}.`
        : stage === 'cue'
          ? `${isChain ? `${where}. ` : ''}First letters only.`
          : stage === 'hidden'
            ? 'Text hidden. Say it from memory.'
            : 'Text shown. Did you have it?';
    content = (
      <div className="space-y-5" data-memorise-step="build" data-unit={unitIndex} data-stage={stage}>
        <StepDots step="build" depth={depth} />
        {top}
        {unit.label && <p className="px-1 text-xs font-semibold text-foreground">{unit.label}</p>}
        <div className="tactile-card rounded-2xl bg-card p-5">
          <UnitView key={unitIndex} unit={unit} stage={stage === 'check' ? 'read' : stage} attempt={attempt} />
        </div>

        <div className="space-y-3">
          <p className="flex min-h-10 items-center justify-center text-center text-sm text-muted">{help}</p>
          <div className={cn('flex justify-center gap-2', stage !== 'read' && 'invisible')} aria-hidden>
            {Array.from({ length: READ_REPS }, (_, i) => (
              <span key={i} className={cn('h-2.5 w-2.5 rounded-full transition-colors motion-reduce:transition-none', i < reps ? 'bg-teal' : 'bg-foreground/15')} />
            ))}
          </div>
          {/* One button for every stage, so it keeps its place and keyboard focus */}
          <Button className="w-full" aria-disabled={lock} onClick={guard(primary.run)} data-build-primary>
            {primary.label}
          </Button>
          {stage === 'check' && (
            <Button
              variant="ghost"
              className="w-full"
              aria-disabled={lock}
              onClick={guard(() => {
                setAttempt((a) => a + 1);
                toStage('cue');
              })}
            >
              Not yet, go over it again
            </Button>
          )}
        </div>
      </div>
    );
  } else if (step === 'recall') {
    // ---------- Recall ----------
    announce = revealed ? 'Answer shown. How did it go?' : '';
    content = (
      <div className="space-y-5" data-memorise-step="recall">
        <StepDots step="recall" depth={depth} />
        {top}
        <div ref={answerRef} tabIndex={-1} className="tactile-card space-y-4 rounded-2xl bg-card p-5 text-center outline-none">
          {meaningOnly ? (
            <>
              {item.arabic ? <ItemArabic text={item.arabic} /> : item.quran && ayahs ? <ItemText item={item} ayahs={ayahs} showEnglish={false} /> : <p className="text-sm text-muted">{item.cue}</p>}
              <p className="text-sm font-medium text-foreground">What does it mean? Say it in your own words.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Recite it from memory</p>
              <p className="text-xs text-muted">{item.cue}</p>
              {hint && !revealed && (item.quran ? (ayahs ?? []).map((a) => <HintAyah key={a.key} ayah={a} className="text-2xl" />) : item.arabic && <CueText text={item.arabic} />)}
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
          <div className="space-y-2" aria-disabled={lock}>
            <p className="text-center text-sm text-muted">How did it go?</p>
            <RatingButtons onRate={guard(finish)} />
          </div>
        ) : (
          <Button
            className="w-full"
            aria-disabled={lock}
            onClick={guard(() => {
              setRevealed(true);
              move();
            })}
          >
            Show me
          </Button>
        )}
      </div>
    );
  } else {
    // ---------- Done ----------
    const n = result?.cardIds.length ?? 0;
    const summary = result?.ayahs
      ? `These ${result.ayahs === 1 ? 'ayah joins' : `${result.ayahs} ayahs join`} your Quran reviews.`
      : n > 0
        ? `${n} ${n === 1 ? 'card' : 'cards'} added. They come up in Review.`
        : item.quran
          ? 'Read. To add these ayahs to your Quran reviews, choose “Memorise the Arabic”.'
          : 'Already in your reviews.';
    content = (
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center text-center" data-memorise-step="done">
        <div className="w-full max-w-sm space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground outline-none">
              {item.title}
            </h2>
            <p className="mt-1.5 text-sm text-muted">{summary}</p>
            {result?.rating === 'missed' && <p className="mt-1 text-sm text-muted">It will come back soon, so it gets easier.</p>}
          </div>
          <div className="space-y-2">
            <Button className="w-full" aria-disabled={lock} onClick={guard(() => result && onDone(result))}>
              Done
            </Button>
            {canBuild && (
              <Button
                variant="ghost"
                className="w-full"
                aria-disabled={lock}
                onClick={guard(() => {
                  startUnit(0);
                  setStep('build');
                })}
              >
                Go through it again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      {content}
    </>
  );
}

export default MemoriseFlow;
