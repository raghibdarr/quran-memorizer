// Essentials → deen cards (all-in-one spec 5.7): an Essentials item the user
// marked as memorised, whose text now lives in an adhkar deck, becomes seeded
// review cards for that deck item. Seeded like createSeededCard: conservative
// strength, staggered over the next week, lastReview 0 so any real review wins a
// sync merge. Counters and favourites are not touched, and the memorised flags
// stay as they are.
//
// Runs once per Essentials id: the ids already carried over are remembered on the
// device, and the store's addCards never overwrites a card that exists, so a
// second run (another device, a restored backup) changes nothing.

import { cardId, facetsFor, seededDeenCard } from '@/lib/deen/cards';
import type { DeenCard } from '@/stores/deen-store';
import type { TextItem } from '@/types/deen';

/** Essentials id → the deck item that now holds the same words */
export const ESSENTIALS_TO_DEEN: Readonly<Record<string, { deck: string; item: string }>> = {
  'dua-istiftah': { deck: 'salah-words', item: 'subhanaka' },
  'dua-ruku': { deck: 'salah-words', item: 'ruku' },
  'dua-rising-ruku': { deck: 'salah-words', item: 'rising-from-ruku' },
  'dua-sujud': { deck: 'salah-words', item: 'sujud' },
  'dua-tashahhud': { deck: 'salah-words', item: 'tashahhud' },
  'dua-durood-ibrahim': { deck: 'salah-words', item: 'salat-ibrahimiyya' },
  'dua-witr': { deck: 'salah-words', item: 'qunut-al-witr' },
  'adhkar-sayyidul-istighfar': { deck: 'adhkar-morning-evening', item: 'sayyid-al-istighfar' },
  'adhkar-morning-3': { deck: 'adhkar-morning-evening', item: 'bismillah-la-yadurr' },
  'dhikr-lailaha': { deck: 'adhkar-morning-evening', item: 'la-ilaha-illallah-100' },
};

/** Where the carried-over Essentials ids are remembered (device only) */
export const MIGRATED_KEY = 'takrar-essentials-migrated-v1';

/** The decks a migration may need to read */
export function decksNeeded(memorized: Record<string, boolean>, done: ReadonlySet<string>): string[] {
  const decks = new Set<string>();
  for (const [id, on] of Object.entries(memorized)) {
    const to = ESSENTIALS_TO_DEEN[id];
    if (on && to && !done.has(id)) decks.add(to.deck);
  }
  return [...decks].sort();
}

export interface MigrationPlan {
  /** New cards to add (none of them exists yet) */
  cards: Record<string, DeenCard>;
  /** Essentials ids now carried over (including ones whose cards already existed) */
  migrated: string[];
}

/**
 * The seeded cards for every memorised Essentials item not yet carried over.
 * An item whose deck or deck item isn't shipped yet is left for a later run.
 */
export function planEssentialsMigration(input: {
  memorized: Record<string, boolean>;
  done: ReadonlySet<string>;
  /** Shipped items per deck id (a deck that isn't live is absent) */
  decks: Readonly<Record<string, readonly TextItem[]>>;
  existing: Readonly<Record<string, DeenCard>>;
  now: number;
}): MigrationPlan {
  const cards: Record<string, DeenCard> = {};
  const migrated: string[] = [];
  let stagger = 0;
  for (const id of Object.keys(input.memorized).sort()) {
    if (!input.memorized[id] || input.done.has(id)) continue;
    const to = ESSENTIALS_TO_DEEN[id];
    if (!to) continue;
    const item = input.decks[to.deck]?.find((i) => i.id === to.item);
    if (!item) continue;
    for (const facet of facetsFor('dhikr', item, { depth: 'arabic' })) {
      const cid = cardId(to.deck, item.id, facet);
      if (input.existing[cid] || cards[cid]) continue;
      cards[cid] = seededDeenCard(to.deck, item.rev, stagger++, input.now);
    }
    migrated.push(id);
  }
  return { cards, migrated };
}

export function readMigrated(storage: Pick<Storage, 'getItem'> | null): Set<string> {
  try {
    const raw = storage?.getItem(MIGRATED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeMigrated(storage: Pick<Storage, 'setItem'> | null, ids: Iterable<string>) {
  try {
    storage?.setItem(MIGRATED_KEY, JSON.stringify([...new Set(ids)].sort()));
  } catch {
    /* private mode: it runs again next visit, and adds nothing new */
  }
}
