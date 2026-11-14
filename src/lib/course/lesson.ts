// One micro-lesson, as steps, and the review cards it adds (all-in-one spec 5.7).
// Pure: the player renders the steps and hands the chosen cards to the deen store.

import { cardId, newDeenCard } from '@/lib/deen/cards';
import type { DeenCard } from '@/stores/deen-store';
import type { Claim, ClaimCard, ClaimEvidence, Lesson, QuranRef, School } from '@/types/deen';

export type LessonStep =
  | { kind: 'intro' }
  | { kind: 'claim'; index: number }
  | { kind: 'check'; index: number }
  | { kind: 'finish' };

/** Intro (no rulings) → each claim → each check question → add cards */
export function lessonSteps(lesson: Lesson): LessonStep[] {
  return [
    { kind: 'intro' },
    ...lesson.claims.map((_, index) => ({ kind: 'claim' as const, index })),
    ...lesson.check.map((_, index) => ({ kind: 'check' as const, index })),
    { kind: 'finish' },
  ];
}

/** A restored step index, kept inside the lesson's steps */
export function clampStep(step: unknown, lesson: Lesson): number {
  const n = typeof step === 'number' && Number.isInteger(step) ? step : 0;
  return Math.min(Math.max(n, 0), lessonSteps(lesson).length - 1);
}

/**
 * The claim cards a lesson adds for a school choice: every card without a school,
 * plus, when a school is chosen, that school's card. Without a school, no school
 * card is added (the positions stay in the lesson, and "also held" on cards).
 */
export function claimCardsFor(claim: Claim, school: School | null): ClaimCard[] {
  return claim.cards.filter((c) => !c.school || (school !== null && c.school === school));
}

/** The other schools' cards, shown on the back of the chosen school's card as "also held" */
export function alsoHeld(claim: Claim, card: ClaimCard): ClaimCard[] {
  return card.school ? claim.cards.filter((c) => c.school && c.school !== card.school) : [];
}

/** Every card id the lesson adds for a school choice: `<deck>:<lessonId>:<cardId>` */
export function lessonCardIdsFor(deck: string, lesson: Lesson, school: School | null): string[] {
  return lesson.claims.flatMap((claim) => claimCardsFor(claim, school).map((c) => cardId(deck, lesson.id, c.id)));
}

/** The cards still to add (ids already in the store are left alone) */
export function cardsToAdd(
  deck: string,
  lesson: Lesson,
  school: School | null,
  existing: Record<string, unknown>,
  now = Date.now(),
): Record<string, DeenCard> {
  const fresh = lessonCardIdsFor(deck, lesson, school).filter((id) => !existing[id]);
  return Object.fromEntries(fresh.map((id) => [id, newDeenCard(deck, lesson.rev, now)]));
}

/** "Add 3 cards to review" */
export function addCardsLabel(n: number): string {
  return `Add ${n} ${n === 1 ? 'card' : 'cards'} to review`;
}

// ---- Evidence

export type EvidenceKind = 'quran' | 'item' | 'consensus';

export function evidenceKind(e: ClaimEvidence): EvidenceKind {
  if ('quran' in e) return 'quran';
  if ('item' in e) return 'item';
  return 'consensus';
}

/** "Quran 5:6", "Quran 2:183-185" */
export function quranLabel(ref: QuranRef): string {
  return `Quran ${ref.surahId}:${ref.ayah}${ref.ayahEnd && ref.ayahEnd !== ref.ayah ? `-${ref.ayahEnd}` : ''}`;
}

/** "<deck>:<itemId>" → its parts (null when malformed) */
export function parseItemRef(ref: string): { deck: string; itemId: string } | null {
  const m = /^([a-z0-9_-]+):([a-z0-9_-]+)$/i.exec(ref);
  return m ? { deck: m[1], itemId: m[2] } : null;
}

/**
 * A course unit keeps hadith that aren't corpus items yet under its own
 * `<deck>-evidence` id (content/deen/course/<unit>/evidence). Their home deck is
 * the course deck, where the build places them beside the lessons. Null for any
 * other deck id.
 */
export function evidenceHostDeck(deck: string): string | null {
  return deck.endsWith('-evidence') && deck.length > '-evidence'.length ? deck.slice(0, -'-evidence'.length) : null;
}

// ---- Check questions (they teach; they never grade cards)

export function isCorrect(q: Lesson['check'][number], chosen: number): boolean {
  return q.answer === chosen;
}

/** The claim a check question is about, for the line under the answer */
export function claimForCheck(lesson: Lesson, q: Lesson['check'][number]): Claim | null {
  return lesson.claims.find((c) => c.id === q.claim) ?? null;
}

// ---- The school question (asked once, on the first lesson opened)

/**
 * Ask for a school on opening a lesson only when none is chosen, the question
 * was never answered or skipped on this device, and no lesson was finished yet
 * (someone who already has lessons done, e.g. synced, has seen it before).
 */
export function shouldAskSchool(school: School | null, askedBefore: boolean, lessonsDoneCount: number): boolean {
  return school === null && !askedBefore && lessonsDoneCount === 0;
}

/** What the claim's kind is called above it */
export const CLAIM_KIND_LABEL: Record<Claim['kind'], string> = {
  agreed: 'Agreed',
  differs: 'Where the schools differ',
  definition: 'Definition',
  'how-to': 'How it is done',
};
