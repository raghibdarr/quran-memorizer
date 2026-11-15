import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ESSENTIALS_TO_DEEN,
  MIGRATED_KEY,
  decksNeeded,
  planEssentialsMigration,
  readMigrated,
  writeMigrated,
} from './deen-migrate-essentials';
import { cardId } from '@/lib/deen/cards';
import type { DeenCard } from '@/stores/deen-store';
import type { EmittedDeck, TextItem } from '@/types/deen';

const NOW = new Date(2026, 10, 15, 12).getTime();
const DAY = 86_400_000;

const deckJson = (id: string): EmittedDeck => JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'deen', `${id}.json`), 'utf8'));
const decks: Record<string, TextItem[]> = Object.fromEntries(
  ['salah-words', 'adhkar-morning-evening'].map((id) => [id, deckJson(id).items as TextItem[]]),
);
const essentials = JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'essentials.json'), 'utf8')) as { items: { id: string }[] }[];
const essentialIds = new Set(essentials.flatMap((c) => c.items.map((i) => i.id)));

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('Essentials to deen cards', () => {
  it('maps only Essentials ids that survived the audit, onto shipped deck items', () => {
    for (const [id, to] of Object.entries(ESSENTIALS_TO_DEEN)) {
      expect(essentialIds.has(id), id).toBe(true);
      expect(decks[to.deck]?.some((i) => i.id === to.item), `${to.deck}/${to.item}`).toBe(true);
    }
    // Removed in the audit, so never mapped
    expect(ESSENTIALS_TO_DEEN['dua-between-sujud']).toBeUndefined();
  });

  it('seeds conservative cards for each memorised item, staggered over the week', () => {
    const plan = planEssentialsMigration({
      memorized: { 'adhkar-sayyidul-istighfar': true, 'dua-ruku': true },
      done: new Set(),
      decks,
      existing: {},
      now: NOW,
    });
    expect(plan.migrated.sort()).toEqual(['adhkar-sayyidul-istighfar', 'dua-ruku']);
    const ids = Object.keys(plan.cards);
    expect(ids).toContain(cardId('adhkar-morning-evening', 'sayyid-al-istighfar', 'recall'));
    expect(ids).toContain(cardId('salah-words', 'ruku', 'recall'));
    for (const card of Object.values(plan.cards)) {
      // Like createSeededCard: a modest interval, never "mastered", and a lastReview
      // of 0 so any real review on another device wins a sync merge
      expect(card.interval).toBe(3);
      expect(card.repetitions).toBe(1);
      expect(card.lastReview).toBe(0);
      expect(card.easeFactor).toBeLessThanOrEqual(2.5);
      expect(card.nextReview).toBeGreaterThan(NOW);
      expect(card.nextReview).toBeLessThanOrEqual(NOW + 8 * DAY);
    }
  });

  it('ignores items not memorised, not mapped, or already carried over', () => {
    const plan = planEssentialsMigration({
      memorized: { 'dua-ruku': false, 'dhikr-subhanallah': true, 'dua-sujud': true, 'not-an-id': true },
      done: new Set(['dua-sujud']),
      decks,
      existing: {},
      now: NOW,
    });
    expect(plan.cards).toEqual({});
    expect(plan.migrated).toEqual([]);
  });

  it('never overwrites a card that already exists, and is idempotent', () => {
    const id = cardId('salah-words', 'tashahhud', 'recall');
    const mine = { deck: 'salah-words', itemRev: 1, addedAt: 1, easeFactor: 2.7, interval: 40, repetitions: 6, nextReview: NOW + 30 * DAY, lastReview: NOW - DAY, lastQuality: 5 } as DeenCard;
    const first = planEssentialsMigration({ memorized: { 'dua-tashahhud': true }, done: new Set(), decks, existing: { [id]: mine }, now: NOW });
    expect(first.cards[id]).toBeUndefined();
    expect(first.migrated).toEqual(['dua-tashahhud']);
    const again = planEssentialsMigration({ memorized: { 'dua-tashahhud': true }, done: new Set(first.migrated), decks, existing: { [id]: mine, ...first.cards }, now: NOW });
    expect(again).toEqual({ cards: {}, migrated: [] });
  });

  it('leaves an item for a later run when its deck is not live yet', () => {
    const plan = planEssentialsMigration({ memorized: { 'dua-witr': true }, done: new Set(), decks: {}, existing: {}, now: NOW });
    expect(plan).toEqual({ cards: {}, migrated: [] });
    expect(decksNeeded({ 'dua-witr': true, 'dhikr-subhanallah': true }, new Set())).toEqual(['salah-words']);
    expect(decksNeeded({ 'dua-witr': true }, new Set(['dua-witr']))).toEqual([]);
  });

  it('remembers what was carried over, and survives bad or missing storage', () => {
    const s = memoryStorage();
    writeMigrated(s, ['b', 'a', 'a']);
    expect(s.m.get(MIGRATED_KEY)).toBe('["a","b"]');
    expect([...readMigrated(s)]).toEqual(['a', 'b']);
    s.m.set(MIGRATED_KEY, '{not json');
    expect(readMigrated(s).size).toBe(0);
    expect(readMigrated(null).size).toBe(0);
    expect(() => writeMigrated(null, ['x'])).not.toThrow();
  });
});
