'use client';

import { useEffect, useRef, useState } from 'react';
import { useDeenStore } from '@/stores/deen-store';
import { useStatsStore } from '@/stores/stats-store';
import { daysBetween, isoFromMs, todayIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import Button from '@/components/ui/button';
import BeadProgress from '@/components/ui/bead-progress';
import RatingButtons, { type Rating } from '@/components/ui/rating-buttons';
import { CardBack, CardFront, cardKindLabel, useCardContent, type CardContent } from './card-view';
import { deckTitleOf } from './deck-source';
import { parseCardId } from '@/lib/deen/cards';
import { RATING_QUALITY, TAP_GUARD_MS } from './memorise-flow';
import { correctionDate, formatIsoDate } from './text';

/** "tomorrow", "in 3 days", "in about 2 weeks" from a (midnight-aligned) due date */
export function whenLabel(ts: number, today = todayIso()): string {
  const days = daysBetween(today, isoFromMs(ts));
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 14) return 'in about a week';
  if (days < 30) return `in about ${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30);
  return `in about ${months} month${months === 1 ? '' : 's'}`;
}

/** The line a card shows once when its item's text was corrected after the card was made */
export function correctionNote(content: CardContent, cardRev: number, errata: string, deckId?: string): string | null {
  if (content.kind === 'term' || content.rev <= cardRev) return null;
  const item = content.kind === 'course' ? content.lesson : content.item;
  // Names and lessons carry no deck of their own: the card id names it
  const deck = deckId || ('deck' in item && typeof item.deck === 'string' ? item.deck : null);
  const date = (deck && correctionDate(errata, deck, item.id)) || item.review.date;
  return date ? `Text corrected on ${formatIsoDate(date)}.` : 'Text corrected since you learned it.';
}

function CardStage({ id, errata, onRated, onSkip, autoFocus }: { id: string; errata: string; onRated: (r: Rating) => void; onSkip: () => void; autoFocus: boolean }) {
  const { content, loading } = useCardContent(id);
  const card = useDeenStore((s) => s.cards[id]);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  // A quick extra tap must not reveal the next card or rate it unseen (see TAP_GUARD_MS)
  const [locked, setLocked] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLocked(false), TAP_GUARD_MS);
    return () => clearTimeout(t);
  }, [revealed]);
  // Focus goes to the card when it arrives (after the first) and when it turns over,
  // since the button that was pressed is gone
  const cardRef = useRef<HTMLDivElement>(null);
  const loaded = !loading;
  useEffect(() => {
    if (loaded && (autoFocus || revealed)) cardRef.current?.focus();
  }, [loaded, autoFocus, revealed]);
  // The correction note compares against the rev the card had when it first
  // showed; the card is then brought up to the item's rev, so it shows once
  const [firstRev] = useState(() => useDeenStore.getState().cards[id]?.itemRev);
  const note = content && firstRev !== undefined ? correctionNote(content, firstRev, errata, parseCardId(id)?.deck) : null;
  useEffect(() => {
    if (!content || !card || content.kind === 'term' || content.rev <= card.itemRev) return;
    const rev = content.rev;
    useDeenStore.setState((s) => (s.cards[id] ? { cards: { ...s.cards, [id]: { ...s.cards[id], itemRev: rev } } } : {}));
  }, [content, card, id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent motion-reduce:animate-none" />
      </div>
    );
  }
  if (!content || !card) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-sm text-muted">This card&apos;s text isn&apos;t available right now.</p>
        <Button variant="ghost" onClick={onSkip}>
          Skip it
        </Button>
      </div>
    );
  }
  const deck = parseCardId(id)?.deck ?? '';
  const canHint = content.kind !== 'term' && content.kind !== 'names' && content.kind !== 'course' && content.facet === 'recall' && !!content.item.arabic;
  return (
    <div className="space-y-5" data-deen-card={id} data-revealed={revealed ? '1' : '0'}>
      <div className="relative">
        <div className="absolute inset-0 translate-x-[8px] translate-y-[8px] rotate-[1deg] rounded-2xl border-[1.5px] border-ink/40 bg-cream" aria-hidden />
        <div ref={cardRef} tabIndex={-1} className="tactile-card relative space-y-4 rounded-2xl bg-card p-6 text-center outline-none">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {deckTitleOf(deck)} · {cardKindLabel(content)}
          </p>
          {note && (
            <p className="rounded-lg bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold-deep" role="note">
              {note}
            </p>
          )}
          <CardFront content={content} hint={hint && !revealed} />
          {canHint && !revealed && !hint && (
            <button type="button" onClick={() => setHint(true)} className="min-h-11 rounded-full bg-foreground/[0.06] px-4 text-xs font-semibold text-foreground/80 hover:bg-foreground/10">
              Hint: first letters
            </button>
          )}
          {revealed && (
            <div className="border-t border-foreground/10 pt-4">
              <CardBack content={content} />
            </div>
          )}
        </div>
      </div>
      {revealed ? (
        <div className="space-y-2" aria-disabled={locked || undefined}>
          <p className="text-center text-sm text-muted">How did it go?</p>
          <RatingButtons onRate={(r) => !locked && onRated(r)} />
        </div>
      ) : (
        <Button
          className="w-full"
          aria-disabled={locked || undefined}
          onClick={() => {
            if (locked) return;
            setRevealed(true);
            setLocked(true);
          }}
        >
          Show me
        </Button>
      )}
      <p className="sr-only" aria-live="polite">
        {revealed ? 'Answer shown. How did it go?' : ''}
      </p>
    </div>
  );
}

/** The finished session's button: ignores the tap that rated the last card */
function DoneButton({ onExit }: { onExit: () => void }) {
  const [locked, setLocked] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLocked(false), TAP_GUARD_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <Button onClick={() => !locked && onExit()} aria-disabled={locked || undefined} className="w-full">
      Done
    </Button>
  );
}

/**
 * The deen review session (spec 2.5, 5.7): each card shows its question,
 * reveals, and is self-rated with the shared rating buttons into the one SM-2
 * core. The list is frozen when the session starts; ratings save as they go,
 * so stopping early loses nothing. Finishing records the day's activity but
 * never gates the Quran "day complete".
 */
export function SessionPlayer({ cardIds, errata = '', onExit }: { cardIds: string[]; errata?: string; onExit: () => void }) {
  const reviewCard = useDeenStore((s) => s.reviewCard);
  const noteIntroduced = useDeenStore((s) => s.noteIntroduced);
  const recordActivity = useStatsStore((s) => s.recordActivity);
  const [index, setIndex] = useState(0);
  const [rated, setRated] = useState(0);
  const recorded = useRef(false);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const done = index >= cardIds.length;
  useEffect(() => {
    if (done && rated > 0 && !recorded.current) {
      recorded.current = true;
      recordActivity();
      haptic.success();
    }
    if (done) doneRef.current?.focus();
  }, [done, rated, recordActivity]);

  if (done) {
    const cards = useDeenStore.getState().cards;
    const next = cardIds.map((id) => cards[id]?.nextReview).filter((n): n is number => typeof n === 'number');
    const soonest = next.length ? Math.min(...next) : null;
    return (
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center text-center" data-deen-session="done">
        <div className="w-full max-w-sm space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div>
            <h2 ref={doneRef} tabIndex={-1} className="text-xl font-bold text-foreground outline-none">
              {rated === 0 ? 'Nothing rated' : `${rated} ${rated === 1 ? 'card' : 'cards'} reviewed`}
            </h2>
            {soonest !== null && rated > 0 && <p className="mt-1.5 text-sm text-muted">The next one comes back {whenLabel(soonest)}.</p>}
          </div>
          <DoneButton onExit={onExit} />
        </div>
      </div>
    );
  }

  const id = cardIds[index];
  const rate = (r: Rating) => {
    const card = useDeenStore.getState().cards[id];
    if (card && card.lastReview === 0 && card.repetitions === 0) noteIntroduced(todayIso());
    reviewCard(id, RATING_QUALITY[r]);
    haptic.selection();
    setRated((n) => n + 1);
    setIndex((i) => i + 1);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="ink-border rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-foreground" aria-live="polite" aria-atomic="true">
          Card {index + 1} of {cardIds.length}
        </span>
        <BeadProgress total={cardIds.length} filled={index} size="sm" className="flex-1 justify-end" />
      </div>
      <CardStage key={id} id={id} errata={errata} onRated={rate} onSkip={() => setIndex((i) => i + 1)} autoFocus={index > 0} />
      <button type="button" onClick={onExit} className="mx-auto block min-h-11 text-sm font-semibold text-muted hover:text-foreground">
        Stop for now
      </button>
    </div>
  );
}

export default SessionPlayer;
