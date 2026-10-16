import type { ReviewCard } from '@/types/quran';
import { qualityToHealth } from './review-helpers';

/**
 * Memory ink (roadmap V2): in the mushaf, each ayah is printed as darkly as it's held.
 * A strong ayah is full ink; a shaky one lighter; a weak or long-overdue one fades; an
 * ayah not yet learned is faint. A review that goes well darkens it again. Pure.
 */
const HELD = { strong: 1, shaky: 0.62, weak: 0.3 } as const;
const UNCHECKED = 0.55;
const NOT_LEARNED = 0.22;
const DAY = 86_400_000;

/** Ink from 0.22 (not learned) to 1 (strong and on schedule) */
export function ayahInk(card: ReviewCard | undefined, now = Date.now()): number {
  if (!card) return NOT_LEARNED;
  let held: number = card.lastReview === 0 ? UNCHECKED : HELD[qualityToHealth(card.lastQuality) as keyof typeof HELD] ?? UNCHECKED;
  // Overdue memory fades: by a third once a day late, by half once a whole interval late
  const late = now - card.nextReview;
  if (late > Math.max(DAY, card.interval * DAY)) held *= 0.5;
  else if (late > DAY) held *= 0.67;
  return Math.round((NOT_LEARNED + (1 - NOT_LEARNED) * Math.max(0, Math.min(1, held))) * 100) / 100;
}

/** "surah:ayah" → ink, for every ayah with a card */
export function inkMap(cards: ReviewCard[], now = Date.now()): Map<string, number> {
  return new Map(cards.map((c) => [`${c.surahId}:${c.ayahNumber}`, ayahInk(c, now)]));
}
