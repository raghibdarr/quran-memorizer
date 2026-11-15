import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECKS } from '@/content/deen/registry';
import type { EmittedDeck, TextItem } from '@/types/deen';
import { isLesson } from './progress';
import { evidenceHostDeck, parseItemRef } from './lesson';

// Every hadith a shipped lesson cites must open to its text and citation. A ref
// that resolves to nothing would show the learner a source they can't check, so
// it fails here. The one exception is the list below, which waits on the build
// emitting a unit's own evidence (HANDOFF course-ui 1 / course-fasting 1): the
// lesson shows those as a plain "reference to come" note, never as a chip. The
// list may only shrink.
const AWAITING_BUILD = new Set([
  'course-fasting-evidence:forgetful-eater',
  'course-fasting-evidence:fasting-is-a-shield',
  'course-fasting-evidence:iftar-dhahaba-al-zama',
]);

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

  it('every hadith a lesson cites opens, apart from the ones waiting on the build', () => {
    const missing = [...new Set(refs.filter((r) => !resolves(r)))];
    expect(missing.filter((r) => !AWAITING_BUILD.has(r))).toEqual([]);
  });

  it('the waiting list only holds refs that are still waiting', () => {
    // Once the build emits one, take it off the list so the check above covers it
    for (const r of AWAITING_BUILD) expect(resolves(r), `${r} now resolves: remove it from AWAITING_BUILD`).toBe(false);
  });
});
