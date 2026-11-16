'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { DeckDepth, DeckKind, TextItem } from '@/types/deen';
import type { Ayah } from '@/types/quran';
import { getSurah } from '@/lib/quran-data';
import { asChosen, cardId, cardsForItem, newDeenCard } from '@/lib/deen/cards';
import { isNewCard } from '@/lib/deen/queue';
import { buildUnits, itemParts, narratorOf, orderBank, orderWords, partGroups } from '@/lib/deen/parts';
import { reviewSm2 } from '@/lib/spaced-repetition';
import { seededShuffle } from '@/lib/shuffle';
import { addLocalDays, startOfDayMs, todayIso } from '@/lib/dates';
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
import WordOrder from '@/components/ui/word-order';
import { CitationLine } from './citation-line';
import { GradingLine } from './grading-line';
import { ReviewBadge } from './review-badge';
import { RichText } from './term';
import { CueText, ItemArabic } from './cue-text';
import { deckKindOf } from './deck-source';
import { workTitle } from './registry-names';
import { whenLabel } from './text';
import { StickyActions } from './sticky-actions';
import { clearPosition, loadPosition, positionKey, savePosition, type FlowPosition } from '@/lib/deen/flow-position';

/** Self-rating to SM-2 quality, as in the Quran reviews */
export const RATING_QUALITY: Record<Rating, number> = { 'got-it': 5, hesitated: 3, missed: 1 };

/** How many times an ayah is read aloud, text in view, before it is hidden (a hadith or dua part is read once, with its meaning) */
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
  /** When the soonest of them comes up in Review (null when none were added) */
  nextAt: number | null;
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

/** The card the Recall step tests: the recitation when the Arabic was memorised, else the meaning */
export function testedFacet(depth: DeckDepth, cards: Record<string, unknown>, deck: string, itemId: string): string | null {
  const recall = cardId(deck, itemId, 'recall');
  const meaning = cardId(deck, itemId, 'meaning');
  if (depth === 'arabic' && recall in cards) return recall;
  return meaning in cards ? meaning : null;
}

/**
 * What finishing the flow writes (spec 2.7, "cards enter the queue"): the
 * self-rating is applied to the card the Recall step tested, so it next comes
 * up on its scheduled day; the item's other cards start tomorrow. All of them
 * were chosen on purpose, so none waits behind the daily new-card cap.
 * Existing cards are left as they are (learning an item again keeps progress),
 * except that a tested card still unrated takes this rating.
 */
export function memoriseOutcome(
  item: TextItem,
  deckKind: DeckKind,
  depth: DeckDepth,
  have: Record<string, DeenCard>,
  quality: number,
  now = Date.now(),
): { add: Record<string, DeenCard>; rated: string | null } {
  const all = cardsForMemorise(item.deck, deckKind, item, depth, now);
  const fresh = asChosen(Object.fromEntries(Object.entries(all).filter(([id]) => !have[id])), addLocalDays(startOfDayMs(now), 1));
  const tested = testedFacet(depth, all, item.deck, item.id);
  let rated: string | null = null;
  if (tested) {
    const current = fresh[tested] ?? have[tested];
    if (current && isNewCard(current)) {
      fresh[tested] = reviewSm2(current, quality);
      rated = tested;
    }
  }
  return { add: fresh, rated };
}

type Step = 'read' | 'build' | 'recall' | 'done';

/** What the learner does with one Build unit, in order */
export type BuildStage = 'read' | 'cue' | 'order' | 'hidden' | 'check';

/**
 * The stages of a Build unit. A part: read it with its meaning, say it from
 * first-letter cues, put its words in order (when it has enough words), then
 * say it with the text hidden and check. Parts said together: from memory
 * straight away, then check.
 */
export function unitStages(unit: { chain: boolean; canOrder: boolean }): BuildStage[] {
  if (unit.chain) return ['hidden', 'check'];
  return unit.canOrder ? ['read', 'cue', 'order', 'hidden', 'check'] : ['read', 'cue', 'hidden', 'check'];
}

/** Where a rating at the check stage leads: on with "Got it", else once more through the cues (or, for a chain, another go from memory) */
export function afterCheck(rating: Rating, chain: boolean): 'next' | BuildStage {
  if (rating === 'got-it') return 'next';
  return chain ? 'hidden' : 'cue';
}

/** One question of the Recall step */
export type RecallStage = 'arabic' | 'meaning' | 'narrator' | 'usage';

/**
 * The Recall step's questions. "Memorise the Arabic": say the Arabic, then
 * what it means, then who narrated it (a hadith) or when it is said (a dua).
 * "Know the meaning": the meaning, then the same last question. The first one
 * is the one that is rated.
 */
export function recallStages(item: TextItem, kind: DeckKind, depth: DeckDepth): RecallStage[] {
  const out: RecallStage[] = [];
  if (depth === 'arabic') out.push('arabic');
  if (depth === 'meaning' || item.translation || item.quran) out.push('meaning');
  if (kind === 'hadith' && narratorOf(item)) out.push('narrator');
  else if (kind === 'dhikr' && item.usage?.when.length) out.push('usage');
  return out;
}

/** The button that picks a saved place back up: "Carry on from part 5 of 9" */
export function resumeLabel(pos: FlowPosition, unitLabel: string | undefined): string {
  if (pos.step === 'recall') return 'Carry on to Recall';
  if (!unitLabel) return 'Carry on where you were';
  if (unitLabel === 'All together') return 'Carry on: all of it together';
  return `Carry on from ${unitLabel.replace(/^Part/, 'part')}`;
}

/** A word tile of the put-in-order stage */
interface Tile {
  id: number;
  match: string;
}

/** One unit of the Build step: a part, or several of them said together */
interface Unit {
  /** "Part 1 of 2", "All together"; empty when the text is learned whole */
  label: string;
  chain: boolean;
  /** Text items: the Arabic of this unit */
  text?: string;
  /** Text items: this part's piece of our translation */
  english?: string | null;
  /** Quran items: the ayahs of this unit */
  ayahs?: Ayah[];
  /** Put-in-order: the opening words already in place, and the tiles in their right order */
  lead: string[];
  tiles: Tile[];
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

/**
 * Moves focus to `ref` whenever `key` changes after the first render. With
 * `onlyIfLost`, only when the control that had focus has gone (so a button that
 * stays in place keeps it).
 */
function useFocusOnChange(key: string, ref: RefObject<HTMLElement | null>, onlyIfLost = false) {
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    const active = document.activeElement;
    if (onlyIfLost && active && active !== document.body && active.isConnected && !(active as HTMLButtonElement).disabled) return;
    ref.current?.focus();
  }, [key, ref, onlyIfLost]);
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
    if (ayahs.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted" role="status" data-ayahs-missing>
          These ayahs couldn&apos;t be loaded. Check your connection and open this again.
        </p>
      );
    }
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
 * The Arabic of a Build unit in its three forms stacked in one grid cell (text,
 * first-letter cues, hidden), only one visible: the card is as tall as the
 * tallest form, so it and what sits under it stay put from stage to stage.
 */
function UnitArabic({ unit, layer, attempt }: { unit: Unit; layer: 'text' | 'cue' | 'none'; attempt: number }) {
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
    <div className="grid min-h-24" data-unit-arabic={layer}>
      <div className={cn(cell, layer !== 'text' && 'invisible')}>{text}</div>
      <div className={cn(cell, layer !== 'cue' && 'invisible')}>{cue}</div>
      {layer === 'none' && (
        <div className={cn(cell, 'rounded-xl border-[1.5px] border-dashed border-foreground/20 px-4 text-center text-sm text-muted')}>{unit.chain ? 'Say it all from memory' : 'Say it from memory'}</div>
      )}
    </div>
  );
}

/** A quiet panel for the trust lines and notes under the text */
const PANEL = 'divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-card-raised px-4 py-3';
const PANEL_ROW = 'py-2.5 first:pt-0 last:pb-0';
/** The small pill buttons inside a card (a hint, first letters) */
const QUIET_PILL = 'min-h-11 rounded-full bg-foreground/[0.06] px-4 text-xs font-semibold text-foreground/80 hover:bg-foreground/10';
/** A step that fills the screen, so the action bar under it rests at the bottom and does not move from stage to stage */
const FILL = 'flex min-h-[calc(100dvh-9.5rem)] flex-col';

/**
 * Learning one item (spec 2.7). Understanding comes first and the wording is
 * built on it:
 *   Read    the whole text with our translation, its sources and notes.
 *   Build   part by part, each with its own English under it: read it aloud
 *           with its meaning, say it from first-letter cues, put its words in
 *           order, then say it with the text hidden and rate yourself; then
 *           the parts together.
 *   Recall  say the Arabic from memory, then what it means and its point, then
 *           who narrated it (or when it is said). The first answer is rated,
 *           and its card joins the review queue with the item's other cards.
 * "Know the meaning" skips Build and adds only the meaning card. Items with a
 * Quran ref render from the surah files, are learned ayah by ayah, and hand
 * their ayahs to the normal Quran review. A text is cut only at its authored
 * parts (content/deen/STYLE.md); without any it is learned whole.
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
  const reviewCard = useDeenStore((s) => s.reviewCard);
  const noteIntroduced = useDeenStore((s) => s.noteIntroduced);
  const addAyahCard = useReviewStore((s) => s.addCard);
  const recordActivity = useStatsStore((s) => s.recordActivity);

  const [step, setStep] = useState<Step>('read');
  // Build
  const [unitIndex, setUnitIndex] = useState(0);
  const [stage, setStage] = useState<BuildStage>('read');
  const [reps, setReps] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [tries, setTries] = useState(0);
  const [cuesShown, setCuesShown] = useState(false);
  const [orderSolved, setOrderSolved] = useState(false);
  // Read
  const [showTranslit, setShowTranslit] = useState(false);
  // Recall
  const [recallAt, setRecallAt] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);
  const [result, setResult] = useState<MemoriseResult | null>(null);
  const { locked, move, guard } = useTapGuard();

  // Build units: each part (or ayah), parts together after a paragraph, then all of it together
  const units = useMemo<Unit[]>(() => {
    if (item.quran) {
      const list = ayahs ?? [];
      const parts: Unit[] = list.map((a, i) => ({ label: `Ayah ${a.number} · ${i + 1} of ${list.length}`, chain: false, ayahs: [a], lead: [], tiles: [] }));
      if (parts.length <= 1) return parts.map((p) => ({ ...p, label: '' }));
      return [...parts, { label: 'All together', chain: true, ayahs: list, lead: [], tiles: [] }];
    }
    const parts = itemParts(item);
    return buildUnits(parts.length, partGroups(item)).map((u): Unit => {
      if (u.kind === 'chain') {
        const text = parts
          .slice(u.from, u.to + 1)
          .map((p) => p.ar)
          .join(' ');
        return { label: u.label, chain: true, text, lead: [], tiles: [] };
      }
      const part = parts[u.index];
      const bank = orderBank(orderWords(part.ar));
      return { label: u.label, chain: false, text: part.ar, english: part.en, lead: bank?.lead ?? [], tiles: (bank?.bank ?? []).map((w, i) => ({ id: i, match: w })) };
    });
  }, [item, ayahs]);

  const meaningOnly = depth === 'meaning';
  const canBuild = !meaningOnly && (item.quran ? !!ayahs?.length : !!item.arabic);
  const lock = locked || undefined;
  const narrator = narratorOf(item);
  const questions = useMemo(() => recallStages(item, deckKind, depth), [item, deckKind, depth]);
  const question = questions[Math.min(recallAt, questions.length - 1)];

  // A saved place from an earlier visit (long texts take a while): offered on
  // the Read screen, kept as the learner moves through Build, cleared at the end
  const posKey = positionKey(item.deck, item.id, depth);
  const [saved, setSaved] = useState<FlowPosition | null>(null);
  useEffect(() => {
    if (step === 'read') setSaved(canBuild && units.length > 1 ? loadPosition(posKey, units.length) : null);
    // only when the units are known (Quran items load their ayahs first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey, units.length, canBuild]);
  useEffect(() => {
    if (!canBuild || units.length < 2) return;
    if (step === 'build') savePosition(posKey, { step: 'build', unit: unitIndex, units: units.length });
    else if (step === 'recall') savePosition(posKey, { step: 'recall', unit: 0, units: units.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, unitIndex]);

  const unit: Unit | undefined = units[unitIndex];
  const stages = unit ? unitStages({ chain: unit.chain, canOrder: unit.tiles.length > 0 }) : [];
  // The tiles as offered: a fresh order on each go, the same on every render of it
  const shuffled = useMemo(() => (unit ? seededShuffle(unit.tiles, `${item.deck}:${item.id}/${unitIndex}/${attempt}`) : []), [unit, item.deck, item.id, unitIndex, attempt]);

  // Focus follows the flow: the heading on each new step or question, the answer when it is
  // shown; within Build, the instruction when the control that had focus has gone
  const headingRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLParagraphElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useFocusOnChange(`${step}:${step === 'recall' ? recallAt : ''}`, headingRef);
  useFocusOnChange(step === 'recall' && revealed ? `answer:${recallAt}` : 'question', answerRef);
  useFocusOnChange(step === 'build' ? `${unitIndex}:${stage}:${tries}` : 'idle', helpRef, true);

  const finish = (rated: Rating) => {
    clearPosition(posKey);
    setSaved(null);
    let ayahCount = 0;
    // Ayahs join the Quran review only when the Arabic was memorised: "Know the
    // meaning" must not put recitation cards in front of someone who never learned them
    if (item.quran && ayahs && !meaningOnly) {
      for (const a of ayahs) addAyahCard(item.quran.surahId, a.number);
      ayahCount = ayahs.length;
    }
    // Only cards that don't exist yet are added (and counted): learning an item again keeps its progress
    const store = useDeenStore.getState();
    const { add, rated: ratedId } = memoriseOutcome(item, deckKind, depth, store.cards, RATING_QUALITY[rated]);
    const ids = Object.keys(add);
    // A card already in the store (unrated) takes the rating through the store's own action
    const existing = ratedId && store.cards[ratedId] ? ratedId : null;
    addCards(existing ? Object.fromEntries(ids.filter((id) => id !== existing).map((id) => [id, add[id]])) : add);
    if (existing) reviewCard(existing, RATING_QUALITY[rated]);
    if (ratedId) noteIntroduced(todayIso());
    const after = useDeenStore.getState().cards;
    const times = ids.map((id) => after[id]?.nextReview).filter((t): t is number => typeof t === 'number');
    recordActivity();
    haptic.success();
    setResult({ cardIds: ids.filter((id) => id !== existing), nextAt: times.length ? Math.min(...times) : null, ayahs: ayahCount, rating: rated });
    setStep('done');
    move();
  };

  const toStage = (s: BuildStage) => {
    setStage(s);
    move();
  };

  const startUnit = (i: number) => {
    const u = units[i];
    setUnitIndex(i);
    setStage(u ? unitStages({ chain: u.chain, canOrder: u.tiles.length > 0 })[0] : 'read');
    setReps(0);
    setTries(0);
    setCuesShown(false);
    setOrderSolved(false);
    setAttempt((a) => a + 1);
    move();
  };

  const toRecall = () => {
    setRecallAt(0);
    setRevealed(false);
    setHint(false);
    setRating(null);
    setStep('recall');
    move();
  };

  const nextUnit = () => (unitIndex + 1 < units.length ? startUnit(unitIndex + 1) : toRecall());

  /** Another go at this unit: fresh cues and tiles; a second pass skips the tiles */
  const goAgain = (to: BuildStage) => {
    setTries((t) => t + 1);
    setAttempt((a) => a + 1);
    setCuesShown(false);
    setOrderSolved(false);
    toStage(to);
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

        <StickyActions className="space-y-2">
          {saved ? (
            <>
              <Button
                className="w-full"
                data-resume
                onClick={() => {
                  if (saved.step === 'build') {
                    startUnit(saved.unit);
                    setStep('build');
                  } else toRecall();
                }}
              >
                {resumeLabel(saved, units[saved.unit]?.label)}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setSaved(null);
                  startUnit(0);
                  setStep('build');
                }}
              >
                Start from the first part
              </Button>
            </>
          ) : (
            <Button
              className="w-full"
              disabled={item.quran ? !ayahs?.length : false}
              onClick={() => {
                if (canBuild) {
                  startUnit(0);
                  setStep('build');
                } else toRecall();
              }}
            >
              {canBuild ? 'Start memorising' : 'I’ve read it, test me'}
            </Button>
          )}
        </StickyActions>
      </div>
    );
  } else if (step === 'build' && unit) {
    // ---------- Build ----------
    const readReps = unit.ayahs ? READ_REPS : 1;
    const hasNext = unitIndex + 1 < units.length;
    const afterCue: BuildStage = tries === 0 && stages.includes('order') ? 'order' : 'hidden';
    const help =
      stage === 'read'
        ? unit.ayahs
          ? `Read it aloud ${READ_REPS} times, looking at the text.`
          : unit.english
            ? 'Read it aloud once, with its meaning.'
            : 'Read it aloud once.'
        : stage === 'cue'
          ? 'Say it from the first letters. Tap a word if you need it.'
          : stage === 'order'
            ? orderSolved
              ? 'That is the order.'
              : unit.lead.length
                ? 'Tap the rest of the words in order.'
                : 'Tap the words in order.'
            : stage === 'hidden'
              ? unit.chain
                ? 'Say them together, from memory.'
                : unit.english
                  ? 'The text is hidden. Say the Arabic for this.'
                  : 'The text is hidden. Say it from memory.'
              : 'Check it against the text. How did it go?';
    const primary: { label: string; run: () => void; off?: boolean } | null =
      stage === 'read'
        ? {
            label: 'I’ve read it aloud',
            run: () => {
              haptic.selection();
              const n = reps + 1;
              setReps(n);
              if (n >= readReps) toStage('cue');
            },
          }
        : stage === 'cue'
          ? { label: 'I’ve said it', run: () => toStage(afterCue) }
          : stage === 'order'
            ? { label: 'Next', run: () => toStage('hidden'), off: !orderSolved }
            : stage === 'hidden'
              ? { label: 'I’ve said it, show me', run: () => toStage('check') }
              : null;
    const where = unit.label || 'The whole text';
    announce =
      stage === 'read'
        ? reps === 0
          ? `${where}. ${help}`
          : `Read ${reps} of ${readReps}.`
        : stage === 'cue'
          ? 'First letters only.'
          : stage === 'order'
            ? orderSolved
              ? 'That is the order.'
              : 'Put the words in order.'
            : stage === 'hidden'
              ? `${unit.chain ? `${where}. ` : ''}Text hidden. Say it from memory.`
              : 'Text shown. How did it go?';
    const layer = stage === 'cue' || (stage === 'hidden' && cuesShown) ? 'cue' : stage === 'hidden' ? 'none' : 'text';
    content = (
      <div className={FILL} data-memorise-step="build" data-unit={unitIndex} data-stage={stage}>
        <div className="space-y-5">
          <StepDots step="build" depth={depth} />
          {top}
          <div className="flex min-h-5 items-center justify-between gap-3 px-1">
            <p className="text-xs font-semibold text-foreground" data-unit-label>
              {unit.label}
            </p>
            <div className="flex gap-1.5" aria-hidden>
              {stages.map((s) => (
                <span key={s} className={cn('h-2 w-2 rounded-full transition-colors motion-reduce:transition-none', stages.indexOf(s) <= stages.indexOf(stage) ? 'bg-teal' : 'bg-foreground/15')} />
              ))}
            </div>
          </div>

          <div className="tactile-card space-y-4 rounded-2xl bg-card p-5">
            {stage === 'order' ? (
              <WordOrder
                key={attempt}
                order={unit.tiles}
                tiles={shuffled}
                lead={
                  unit.lead.length > 0 &&
                  unit.lead.map((w, i) => (
                    <span key={`lead-${i}`} className="arabic-text rounded-lg border border-foreground/15 px-3 py-1.5 text-xl text-foreground/70">
                      {w}
                    </span>
                  ))
                }
                renderPlaced={(t) => t.match}
                renderTile={(t) => (
                  <span className="arabic-text text-xl" lang="ar">
                    {t.match}
                  </span>
                )}
                onSolved={() => {
                  haptic.selection();
                  setOrderSolved(true);
                  primaryRef.current?.focus();
                }}
              />
            ) : (
              <UnitArabic key={unitIndex} unit={unit} layer={layer} attempt={attempt} />
            )}
            {unit.ayahs && !unit.chain && unit.ayahs.map((a) => <TranslationText key={a.key} ayah={a} className="border-t border-foreground/10 pt-3 text-sm leading-relaxed text-foreground" />)}
            {unit.english && (
              <p className="border-t border-foreground/10 pt-3 text-[15px] leading-relaxed text-foreground" data-part-english>
                <RichText text={unit.english} />
              </p>
            )}
            {unit.chain && stage === 'hidden' && !cuesShown && (
              <div className="text-center">
                <button type="button" onClick={() => setCuesShown(true)} className={QUIET_PILL}>
                  Show first letters
                </button>
              </div>
            )}
          </div>

          <p ref={helpRef} tabIndex={-1} className="flex min-h-10 items-center justify-center text-center text-sm text-muted outline-none" data-build-help>
            {help}
          </p>
          {readReps > 1 && (
            <div className={cn('flex justify-center gap-2', stage !== 'read' && 'invisible')} aria-hidden>
              {Array.from({ length: readReps }, (_, i) => (
                <span key={i} className={cn('h-2.5 w-2.5 rounded-full transition-colors motion-reduce:transition-none', i < reps ? 'bg-teal' : 'bg-foreground/15')} />
              ))}
            </div>
          )}
        </div>

        <StickyActions className="mt-auto">
          {primary ? (
            // One button for every stage but the last, so it keeps its place and keyboard focus
            <button
              ref={primaryRef}
              type="button"
              aria-disabled={lock || primary.off || undefined}
              onClick={guard(() => !primary.off && primary.run())}
              data-build-primary
              className={cn(
                'tactile-btn w-full rounded-xl px-6 py-3 font-semibold',
                primary.off ? 'cursor-not-allowed bg-foreground/10 text-muted shadow-none' : 'bg-teal text-on-teal hover:bg-teal-light',
              )}
            >
              {primary.label}
            </button>
          ) : (
            <div className="space-y-2" aria-disabled={lock}>
              <RatingButtons
                onRate={guard((r: Rating) => {
                  const to = afterCheck(r, unit.chain);
                  if (to === 'next') nextUnit();
                  else goAgain(to);
                })}
              />
              <p className="text-center text-xs text-muted">
                {tries > 0 ? (
                  <button type="button" aria-disabled={lock} onClick={guard(nextUnit)} className="min-h-9 px-2 font-semibold text-foreground/80 underline underline-offset-2">
                    {hasNext ? 'Move on for now' : 'Move on to recall'}
                  </button>
                ) : (
                  'Anything but “Got it” takes you through it once more.'
                )}
              </p>
            </div>
          )}
        </StickyActions>
      </div>
    );
  } else if (step === 'recall' && question) {
    // ---------- Recall ----------
    const isLast = recallAt === questions.length - 1;
    const isRated = recallAt === 0;
    const nextQuestion = () => {
      setRecallAt((i) => i + 1);
      setRevealed(false);
      move();
    };
    const heading =
      question === 'arabic'
        ? 'Say the Arabic from memory'
        : question === 'meaning'
          ? deckKind === 'hadith' && !item.quran
            ? 'What does it mean, and what is its point?'
            : 'What does it mean?'
          : question === 'narrator'
            ? 'Who narrated it?'
            : 'When is it said?';
    // What the question is asked about: the cue for the Arabic, the Arabic itself for the rest
    const arabicShown = item.arabic ? <ItemArabic text={item.arabic} /> : item.quran && ayahs ? <ItemText item={item} ayahs={ayahs} showEnglish={false} /> : <p className="text-sm text-muted">{item.cue}</p>;
    const prompt =
      question === 'arabic' ? (
        <>
          <p className="text-xs text-muted">{item.cue}</p>
          {hint && !revealed && (item.quran ? (ayahs ?? []).map((a) => <HintAyah key={a.key} ayah={a} className="text-2xl" />) : item.arabic && <CueText text={item.arabic} />)}
          {!hint && !revealed && (
            <button type="button" onClick={() => setHint(true)} className={QUIET_PILL}>
              Hint: first letters
            </button>
          )}
        </>
      ) : question === 'narrator' ? (
        <p className="text-sm text-muted">{item.title}</p>
      ) : (
        arabicShown
      );
    const answer =
      question === 'arabic' ? (
        <ItemText item={item} ayahs={ayahs} showEnglish={false} />
      ) : question === 'meaning' ? (
        <div className="space-y-3">
          {item.translation ? (
            <p className="text-[15px] leading-relaxed text-foreground">
              <RichText text={item.translation} />
            </p>
          ) : (
            <ItemText item={item} ayahs={ayahs} />
          )}
          {deckKind === 'hadith' && !item.quran && (
            <p className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 text-sm text-foreground" data-recall-point>
              <span className="block text-xs font-semibold text-muted">Its point</span>
              {item.title}
            </p>
          )}
        </div>
      ) : question === 'narrator' ? (
        <p className="text-center text-lg font-bold text-foreground" data-recall-narrator>
          {narrator}
        </p>
      ) : (
        <ul className="space-y-1 text-[15px] leading-relaxed text-foreground" data-recall-usage>
          {item.usage?.when.map((w) => (
            <li key={w}>
              <RichText text={w} />
            </li>
          ))}
          {item.usage?.repeat && item.usage.repeat > 1 && <li className="text-xs text-muted">Said {item.usage.repeat} times</li>}
        </ul>
      );
    announce = revealed ? (isRated ? 'Answer shown. How did it go?' : 'Answer shown.') : '';
    content = (
      <div className={FILL} data-memorise-step="recall" data-recall={question}>
        <div className="space-y-5">
          <StepDots step="recall" depth={depth} />
          <div className="space-y-1 text-center">
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-foreground outline-none">
              {heading}
            </h2>
            {questions.length > 1 && (
              <p className="text-xs text-muted">
                {recallAt + 1} of {questions.length}
              </p>
            )}
          </div>
          <div ref={answerRef} tabIndex={-1} className="tactile-card space-y-4 rounded-2xl bg-card p-5 text-center outline-none">
            {prompt}
            {revealed && <div className="border-t border-foreground/10 pt-4 text-start">{answer}</div>}
          </div>
        </div>
        <StickyActions className="mt-auto">
          {!revealed ? (
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
          ) : isRated ? (
            <div className="space-y-2" aria-disabled={lock}>
              <p className="text-center text-sm text-muted">How did it go?</p>
              <RatingButtons
                onRate={guard((r: Rating) => {
                  if (isLast) return finish(r);
                  setRating(r);
                  nextQuestion();
                })}
              />
            </div>
          ) : (
            <Button className="w-full" aria-disabled={lock} onClick={guard(() => (isLast ? finish(rating ?? 'hesitated') : nextQuestion()))}>
              {isLast ? 'Finish' : 'Next'}
            </Button>
          )}
        </StickyActions>
      </div>
    );
  } else {
    // ---------- Done ----------
    const n = result?.cardIds.length ?? 0;
    const summary = result?.ayahs
      ? `These ${result.ayahs === 1 ? 'ayah joins' : `${result.ayahs} ayahs join`} your Quran reviews.`
      : n > 0
        ? `${n} ${n === 1 ? 'card' : 'cards'} added. ${n === 1 ? 'It comes' : 'They start coming'} up in Review ${result?.nextAt ? whenLabel(result.nextAt) : 'soon'}.`
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
