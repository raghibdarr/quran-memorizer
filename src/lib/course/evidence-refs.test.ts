import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECKS } from '@/content/deen/registry';
import type { EmittedDeck, TextItem } from '@/types/deen';
import { isLesson } from './progress';
import { evidenceHostDeck, parseItemRef } from './lesson';

// Every hadith a shipped lesson cites must open to its text and citation. A ref
// that resolves to nothing would show the learner a source they can't check, so
// it fails here. A unit's own evidence hadith resolve through the `evidence`
// array scripts/build-deen.mjs emits beside the unit's lessons.

const dataDir = join(process.cwd(), 'src', 'data', 'deen');
const readDeck = (id: string): (EmittedDeck & { evidence?: TextItem[] }) | null => {
  const file = join(dataDir, `${id}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};
const shippable = (i: { review?: { status?: string } } | undefined) => !!i?.review?.status && i.review.status !== 'draft';

function resolves(ref: string): boolean {
  const p = parseItemRef(ref);
  if (!p) return false;
  const direct = readDeck(p.deck)?.items.find((i) => i.id === p.itemId) as TextItem | undefined;
  if (direct && 'citations' in direct) return shippable(direct);
  const host = evidenceHostDeck(p.deck);
  return !!host && shippable(readDeck(host)?.evidence?.find((i) => i.id === p.itemId));
}

const courseDecks = DECKS.filter((d) => d.kind === 'course').map((d) => d.id);

describe('course evidence refs', () => {
  const refs = courseDecks.flatMap((id) =>
    (readDeck(id)?.items ?? []).filter(isLesson).flatMap((l) => l.claims.flatMap((c) => c.evidence.flatMap((e) => ('item' in e ? [e.item] : [])))),
  );

  it('every hadith a lesson cites opens', () => {
    expect(refs.length).toBeGreaterThan(0);
    expect([...new Set(refs.filter((r) => !resolves(r)))]).toEqual([]);
  });

  it("a unit's own evidence hadith are emitted beside its lessons", () => {
    const ev = readDeck('course-fasting')?.evidence ?? [];
    expect(ev.map((i) => i.id).sort()).toEqual(['fasting-is-a-shield', 'forgetful-eater', 'iftar-dhahaba-al-zama']);
    expect(refs.filter((r) => r.startsWith('course-fasting-evidence:')).length).toBe(3);
  });
});
