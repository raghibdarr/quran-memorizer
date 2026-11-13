// Deck loading (all-in-one spec 3.3): which decks are live, and their emitted
// content. Everything loads by dynamic import, on the screen that needs it.

import { DECKS, deckInfo, type DeckInfo, type DeckModule } from '@/content/deen/registry';
import type { EmittedDeck, GlossaryTerm } from '@/types/deen';
import { SHOW_UNREVIEWED_FIQH } from './flags';

const unwrap = <T,>(m: T | { default: T }): T =>
  m && typeof m === 'object' && 'default' in (m as object) ? (m as { default: T }).default : (m as T);

const modules = new Map<string, Promise<DeckModule | null>>();
const decks = new Map<string, Promise<EmittedDeck | null>>();

/** The deck's module, or null for an unknown id or a failed load */
export function loadDeckModule(id: string): Promise<DeckModule | null> {
  let p = modules.get(id);
  if (!p) {
    const info = deckInfo(id);
    p = info ? info.module().then((m) => m.default).catch(() => null) : Promise.resolve(null);
    modules.set(id, p);
  }
  return p;
}

/** Whether a deck shows anywhere: its package shipped it, and fiqh isn't held back */
export function isDeckVisible(info: DeckInfo, mod: DeckModule | null, showFiqh = SHOW_UNREVIEWED_FIQH): boolean {
  if (!mod?.ready) return false;
  return info.kind !== 'course' || showFiqh;
}

/** The decks that are live, in registry order */
export async function visibleDecks(): Promise<DeckInfo[]> {
  const mods = await Promise.all(DECKS.map((d) => loadDeckModule(d.id)));
  return DECKS.filter((d, i) => isDeckVisible(d, mods[i]));
}

/** A live deck's emitted content (null when hidden, unknown or not loadable) */
export function loadDeck(id: string): Promise<EmittedDeck | null> {
  let p = decks.get(id);
  if (!p) {
    p = (async () => {
      const info = deckInfo(id);
      const mod = await loadDeckModule(id);
      if (!info || !mod || !isDeckVisible(info, mod) || !mod.ready) return null;
      try {
        return unwrap(await mod.load());
      } catch {
        return null;
      }
    })();
    decks.set(id, p);
  }
  return p;
}

/** One item of a live deck */
export async function loadItem<T = EmittedDeck['items'][number]>(deckId: string, itemId: string): Promise<T | null> {
  const deck = await loadDeck(deckId);
  return (deck?.items.find((i) => i.id === itemId) as T | undefined) ?? null;
}

/** The glossary terms the live decks' packages ship (core terms load separately, see glossary.ts) */
export async function loadDeckGlossaries(): Promise<GlossaryTerm[][]> {
  const mods = await Promise.all(DECKS.map((d) => loadDeckModule(d.id)));
  const loaders = DECKS.flatMap((d, i) => {
    const m = mods[i];
    return m && isDeckVisible(d, m) && m.ready && m.glossary ? [m.glossary] : [];
  });
  // Several decks of one package share a glossary loader: load each once
  const unique = [...new Set(loaders)];
  return Promise.all(unique.map((l) => l().then(unwrap).catch(() => [] as GlossaryTerm[])));
}

/** Tests only: forget cached modules and decks */
export function resetDeckCacheForTests() {
  modules.clear();
  decks.clear();
}
