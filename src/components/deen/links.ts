// In-app addresses the deen engine owns, for content packages to link to.

import type { DeckDepth } from '@/types/deen';

/**
 * The full-screen learning screen for one item: /review/deen?learn=<deck>:<id>.
 * Without `depth` it uses the learner's choice for the deck, else the deck's
 * default, else asks. Finishing returns to where the learner came from.
 */
export function learnHref(deck: string, itemId: string, depth?: DeckDepth): string {
  return `/review/deen?learn=${encodeURIComponent(`${deck}:${itemId}`)}${depth ? `&depth=${depth}` : ''}`;
}

/** The review session, optionally for one deck */
export function sessionHref(deck?: string): string {
  return deck ? `/review/deen?deck=${encodeURIComponent(deck)}` : '/review/deen';
}
