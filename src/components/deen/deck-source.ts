// Where the deen engine's screens get decks from: foundations' loader (the
// registry, live decks only), plus one end-to-end test seam.
//
// The test seam: a Playwright spec may define `window.__TAKRAR_TEST_DECKS__`
// (page.addInitScript) holding emitted decks, e.g. the fixture deck built from
// content/deen/_fixture. Nothing in the app ever sets it, nothing is fetched for
// it, and no fixture data is bundled: without it this is the registry, exactly.

import { DECKS, deckInfo, type DeckInfo } from '@/content/deen/registry';
import { loadDeck, visibleDecks } from '@/lib/deen/load';
import type { DeckKind, EmittedDeck } from '@/types/deen';

/** The deck id glossary term cards use (cards.ts termCard) */
export const GLOSSARY_DECK = 'glossary';

export interface TestDeck {
  info: Pick<DeckInfo, 'title' | 'blurb' | 'kind' | 'group' | 'route' | 'defaultDepth'> & { id: string };
  deck: EmittedDeck;
}

/** A deck as the engine's screens see it (registry entry or test deck) */
export type LiveDeck = Omit<DeckInfo, 'id' | 'module'> & { id: string };

function testDecks(): TestDeck[] {
  if (typeof window === 'undefined') return [];
  const raw = (window as unknown as { __TAKRAR_TEST_DECKS__?: unknown }).__TAKRAR_TEST_DECKS__;
  return Array.isArray(raw) ? (raw as TestDeck[]).filter((d) => d?.info?.id && Array.isArray(d?.deck?.items)) : [];
}

const strip = ({ module: _m, ...rest }: DeckInfo): LiveDeck => {
  void _m;
  return rest;
};

/** Live decks in registry order (test decks last) */
export async function liveDecks(): Promise<LiveDeck[]> {
  const real = (await visibleDecks()).map(strip);
  return [...real, ...testDecks().map((t) => t.info)];
}

/** A live deck's info, if it is live */
export async function liveDeckInfo(id: string): Promise<LiveDeck | null> {
  return (await liveDecks()).find((d) => d.id === id) ?? null;
}

/** A live deck's emitted content */
export async function getDeck(id: string): Promise<EmittedDeck | null> {
  const t = testDecks().find((d) => d.info.id === id);
  if (t) return t.deck;
  return loadDeck(id);
}

export async function getItem<T = EmittedDeck['items'][number]>(deckId: string, itemId: string): Promise<T | null> {
  const deck = await getDeck(deckId);
  return (deck?.items.find((i) => i.id === itemId) as T | undefined) ?? null;
}

/** The kind of a deck id, registry or test deck (null when unknown) */
export function deckKindOf(id: string): DeckKind | null {
  return deckInfo(id)?.kind ?? testDecks().find((d) => d.info.id === id)?.info.kind ?? null;
}

/** Title for a deck id, including the glossary pseudo-deck */
export function deckTitleOf(id: string): string {
  if (id === GLOSSARY_DECK) return 'Terms';
  return deckInfo(id)?.title ?? testDecks().find((d) => d.info.id === id)?.info.title ?? id;
}

export { DECKS };
