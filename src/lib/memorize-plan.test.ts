import { describe, expect, it } from 'vitest';
import { afterAyah, lastUnitOfAyah, walkPlan, type MemorizePos, type PlanUnit } from './memorize-plan';

/** Units for ayahs split into the given numbers of parts */
const unitsFor = (...parts: number[]): PlanUnit[] =>
  parts.flatMap((count, ayahIdx) => Array.from({ length: count }, (_, index) => ({ ayahIdx, seg: { index, count } })));

/** One line per stage: learning collapses to "learn u<unit>" once per unit */
const outline = (plan: MemorizePos[]) =>
  plan
    .filter((p) => p.stage !== 'learning' || p.step === 'listen-with-text')
    .map((p) => (p.stage === 'learning' ? `learn u${p.unit}` : p.stage === 'done' ? 'done' : `${p.stage} u${p.unit}`));

describe('the Memorize route', () => {
  it('three short ayahs: learn, learn, chain A+B, learn the last (its chain is the Test)', () => {
    expect(outline(walkPlan(unitsFor(1, 1, 1), 3))).toEqual(['learn u0', 'learn u1', 'chaining u1', 'learn u2']);
  });

  it('pins every step of a one-ayah lesson: 6-4-4-6 then the word challenge', () => {
    expect(walkPlan(unitsFor(1), 1).map((p) => (p.stage === 'learning' ? p.step : p.stage))).toEqual([
      'listen-with-text', 'recite-from-memory', 'reinforce-with-text', 'final-memory', 'word-order',
    ]);
  });

  it('joins a long ayah’s parts as they are learned: A, B, A+B, C, A+B+C', () => {
    expect(outline(walkPlan(unitsFor(3), 1))).toEqual(['learn u0', 'learn u1', 'chain-parts u1', 'learn u2', 'chain-parts u2']);
  });

  it('a split ayah in the middle: parts joined first, then chained with the ayahs before it', () => {
    expect(outline(walkPlan(unitsFor(1, 2, 1), 3))).toEqual([
      'learn u0',
      'learn u1', 'learn u2', 'chain-parts u2', 'chaining u2',
      'learn u3',
    ]);
  });

  it('"I know this ayah" skips its remaining parts and joins', () => {
    const units = unitsFor(3, 1);
    expect(lastUnitOfAyah(units, 0)).toBe(2);
    expect(afterAyah(units, 2, lastUnitOfAyah(units, 0))).toEqual({ stage: 'learning', unit: 3, step: 'listen-with-text' });
  });
});
