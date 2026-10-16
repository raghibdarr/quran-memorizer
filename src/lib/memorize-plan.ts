/**
 * The Memorize step's route through a lesson, as pure functions (M9 enabler: this
 * used to live inside chunk-phase.tsx's event handlers).
 *
 * A lesson is a list of units: one per ayah, or one per waqf part for long ayahs
 * (segmentAyah). Each unit is learned with the 6-4-4-6 pattern plus the word
 * challenge. Then:
 *   - a long ayah's parts are joined as they're learned: after part B, recite A+B
 *     from memory; after C, A+B+C; the last join is the whole ayah;
 *   - each new ayah (from the second) is chained with all the ayahs before it,
 *     except the lesson's last ayah, whose chain is the Test phase itself.
 */

export type LearnStep =
  | 'listen-with-text'      // 6x: listen + repeat, text visible
  | 'recite-from-memory'    // 4x: text hidden, self-report each rep
  | 'reinforce-with-text'   // 4x: text visible again, listen + repeat
  | 'final-memory'          // 6x: text hidden, solidify
  | 'word-order';           // arrange words

export const LEARN_STEPS: LearnStep[] = ['listen-with-text', 'recite-from-memory', 'reinforce-with-text', 'final-memory', 'word-order'];

/** 6-4-4-6 (owner, 2026-09-27: kept as the default; steps can be skipped instead) */
export const STEP_REPS: Record<Exclude<LearnStep, 'word-order'>, number> = {
  'listen-with-text': 6,
  'recite-from-memory': 4,
  'reinforce-with-text': 4,
  'final-memory': 6,
};

/** What the plan needs to know about a unit */
export interface PlanUnit {
  ayahIdx: number;
  /** part index within its ayah, and how many parts the ayah has */
  seg: { index: number; count: number };
}

export type MemorizePos =
  | { stage: 'learning'; unit: number; step: LearnStep }
  /** recite parts 0..units[unit].seg.index of that unit's ayah from memory */
  | { stage: 'chain-parts'; unit: number }
  /** recite ayahs 0..units[unit].ayahIdx from memory */
  | { stage: 'chaining'; unit: number }
  | { stage: 'done' };

export const startOfUnit = (unit: number): MemorizePos => ({ stage: 'learning', unit, step: 'listen-with-text' });

/** After the last unit of an ayah: chain with earlier ayahs, move on, or finish */
export function afterAyah(units: PlanUnit[], ayahCount: number, lastUnit: number): MemorizePos {
  const ayahIdx = units[lastUnit].ayahIdx;
  if (ayahIdx === ayahCount - 1) return { stage: 'done' }; // the Test is the whole-lesson chain
  if (ayahIdx === 0) return startOfUnit(lastUnit + 1); // nothing earlier to chain with
  return { stage: 'chaining', unit: lastUnit };
}

/** After a unit (and its parts join, if any): the ayah's next part, or the ayah is done */
function afterUnit(units: PlanUnit[], ayahCount: number, unit: number): MemorizePos {
  const next = units[unit + 1];
  if (next && next.ayahIdx === units[unit].ayahIdx) return startOfUnit(unit + 1);
  return afterAyah(units, ayahCount, unit);
}

export function nextPos(units: PlanUnit[], ayahCount: number, pos: MemorizePos): MemorizePos {
  switch (pos.stage) {
    case 'learning': {
      const i = LEARN_STEPS.indexOf(pos.step);
      if (i < LEARN_STEPS.length - 1) return { ...pos, step: LEARN_STEPS[i + 1] };
      // Unit learned: from the second part on, join it to the parts before it
      if (units[pos.unit].seg.index >= 1) return { stage: 'chain-parts', unit: pos.unit };
      return afterUnit(units, ayahCount, pos.unit);
    }
    case 'chain-parts':
      return afterUnit(units, ayahCount, pos.unit);
    case 'chaining':
      return startOfUnit(pos.unit + 1);
    case 'done':
      return pos;
  }
}

/** The ayah's last unit (where "I know this ayah" skips to) */
export function lastUnitOfAyah(units: PlanUnit[], unit: number): number {
  let last = unit;
  while (units[last + 1]?.ayahIdx === units[unit].ayahIdx) last++;
  return last;
}

/** Every position from the start, for tests and time estimates */
export function walkPlan(units: PlanUnit[], ayahCount: number): MemorizePos[] {
  const out: MemorizePos[] = [];
  let pos: MemorizePos = startOfUnit(0);
  while (pos.stage !== 'done') {
    out.push(pos);
    pos = nextPos(units, ayahCount, pos);
  }
  return out;
}
