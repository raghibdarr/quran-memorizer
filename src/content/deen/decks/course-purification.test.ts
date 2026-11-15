import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import deckModule from './course-purification';
import emitted from '@/data/deen/course-purification.json';
import glossary from '@/data/deen/glossary/course-purification.json';
import unit from '../../../../content/deen/course/purification/unit.json';
import type { Lesson } from '@/types/deen';

// The build emits items sorted by id; the course reads them by `order`
const lessons = [...(emitted as unknown as { items: Lesson[] }).items].sort((a, b) => a.order - b.order);

describe('course-purification deck', () => {
  it('is ready and loads the emitted lessons and glossary', async () => {
    if (!deckModule.ready) throw new Error('course-purification is not ready');
    const loaded = await deckModule.load();
    const deck = 'default' in loaded ? loaded.default : loaded;
    expect(deck.items.length).toBe(lessons.length);
    const terms = await deckModule.glossary?.();
    expect(terms && ('default' in terms ? terms.default : terms).length).toBe(glossary.length);
  });

  it('ships the unit’s lessons in order, all source-checked and none labelled scholar-reviewed', () => {
    expect(lessons.map((l) => l.id)).toEqual(unit.lessons);
    expect(lessons.map((l) => l.order)).toEqual(unit.lessons.map((_, i) => i + 1));
    for (const l of lessons) {
      expect(l.unit).toBe(unit.id);
      expect(l.review.status).toBe('source-checked');
    }
  });

  it('keeps lessons small: at most 6 claims, 2 to 4 check questions, 1 or 2 general cards per claim', () => {
    for (const l of lessons) {
      expect(l.claims.length, l.id).toBeLessThanOrEqual(6);
      expect(l.check.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.check.length, l.id).toBeLessThanOrEqual(4);
      const ids = l.claims.flatMap((c) => c.cards.map((k) => k.id));
      expect(new Set(ids).size, `${l.id}: card ids are unique`).toBe(ids.length);
      for (const c of l.claims) {
        const general = c.cards.filter((k) => !k.school).length;
        expect(general, `${l.id}/${c.id}`).toBeGreaterThanOrEqual(1);
        expect(general, `${l.id}/${c.id}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('gives every position a primer quote, the unit’s primer for that school, and a school card saying the same', () => {
    const primers = unit.primers as Record<string, string>;
    for (const l of lessons) {
      for (const c of l.claims) {
        if (c.kind === 'differs') expect(c.positions?.length ?? 0, `${l.id}/${c.id}`).toBeGreaterThanOrEqual(2);
        for (const p of c.positions ?? []) {
          expect(p.source.work, `${l.id}/${c.id} ${p.school}`).toBe(primers[p.school]);
          expect(p.quote?.trim(), `${l.id}/${c.id} ${p.school}`).toBeTruthy();
          if (c.kind !== 'differs') continue;
          const card = c.cards.find((k) => k.school === p.school);
          expect(card, `${l.id}/${c.id}: ${p.school} card`).toBeDefined();
          expect(card!.back).toBe(p.text);
        }
        for (const k of c.cards) {
          if (k.school) expect(c.positions?.some((p) => p.school === k.school), `${l.id}/${c.id} ${k.id}`).toBe(true);
        }
      }
    }
  });

  it('does not give the answer away by position, and has no duplicate options', () => {
    const answers = lessons.flatMap((l) => l.check.map((q) => q.answer));
    const counts = [0, 1, 2].map((i) => answers.filter((a) => a === i).length);
    for (const n of counts) expect(n).toBeGreaterThanOrEqual(Math.floor(answers.length / 5));
    for (const l of lessons) {
      for (const q of l.check) {
        expect(new Set(q.options).size, `${l.id}: ${q.q}`).toBe(q.options.length);
        expect(q.options.length, `${l.id}: ${q.q}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// The authoring record behind the lessons (not shipped). tools/verify-citations.mjs checks
// it against the online copies; this keeps it in step with the lessons without the network.
describe('course-purification citation record', () => {
  const dir = join(process.cwd(), 'content/deen/course/purification');
  interface Rec { lesson: string; claim: string; role: string; school?: string; work: string; location: string; quote: string; url?: string }
  const { citations } = JSON.parse(readFileSync(join(dir, 'citations.json'), 'utf8')) as { citations: Rec[] };
  const authored = readdirSync(join(dir, 'lessons'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, 'lessons', f), 'utf8')) as Lesson);

  it('emitted lessons are the authored ones at the same rev', () => {
    const revs = Object.fromEntries(authored.map((l) => [l.id, l.rev]));
    expect(Object.fromEntries(lessons.map((l) => [l.id, l.rev]))).toEqual(revs);
    for (const l of lessons) expect(l.claims, l.id).toEqual(authored.find((a) => a.id === l.id)!.claims);
  });

  it('records every position quote and consensus location as shipped, each with its page', () => {
    for (const l of authored) {
      for (const c of l.claims) {
        for (const p of c.positions ?? []) {
          const rec = citations.find((r) => r.lesson === l.id && r.claim === c.id && r.role === 'position' && r.school === p.school);
          expect(rec, `${l.id}/${c.id} ${p.school}`).toBeDefined();
          expect({ quote: rec!.quote, work: rec!.work, location: rec!.location }, `${l.id}/${c.id} ${p.school}`).toEqual({ quote: p.quote, work: p.source.work, location: p.source.location });
        }
        for (const e of c.evidence) {
          if (!('consensus' in e)) continue;
          const rec = citations.find((r) => r.lesson === l.id && r.claim === c.id && r.role === 'evidence' && r.work === e.consensus.work && r.location === e.consensus.location);
          expect(rec, `${l.id}/${c.id} ${e.consensus.work}`).toBeDefined();
        }
      }
    }
    for (const r of citations) {
      expect(r.url, `${r.lesson}/${r.claim} ${r.role}`).toMatch(/^https:\/\/shamela\.ws\/book\/\d+\/\d+/);
      expect(r.quote.trim(), `${r.lesson}/${r.claim} ${r.role}`).toBeTruthy();
    }
  });

  it('locates every difference in Bidayat al-Mujtahid and cites no hadith item', () => {
    for (const l of authored) {
      for (const c of l.claims) {
        expect(c.evidence.length, `${l.id}/${c.id}`).toBeGreaterThan(0);
        expect(c.evidence.some((e) => 'item' in e), `${l.id}/${c.id}`).toBe(false);
        if (c.kind !== 'differs') continue;
        expect(citations.some((r) => r.lesson === l.id && r.claim === c.id && r.work === 'bidayat-al-mujtahid'), `${l.id}/${c.id}`).toBe(true);
      }
    }
  });

  it('ties every check question to a claim of its lesson, with the answer in range', () => {
    for (const l of authored) {
      const ids = new Set(l.claims.map((c) => c.id));
      for (const q of l.check) {
        expect(ids.has(q.claim), `${l.id}: ${q.q}`).toBe(true);
        expect(q.answer, `${l.id}: ${q.q}`).toBeGreaterThanOrEqual(0);
        expect(q.answer, `${l.id}: ${q.q}`).toBeLessThan(q.options.length);
      }
    }
  });
});
