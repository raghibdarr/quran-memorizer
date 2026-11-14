import { describe, expect, it } from 'vitest';
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
