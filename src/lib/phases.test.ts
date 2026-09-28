import { describe, expect, it } from 'vitest';
import { phaseProgressPct, PHASE_LABELS, visiblePhase } from './phases';

describe('lesson phases', () => {
  it('an older save in the merged Understand step shows as Listen', () => {
    expect(visiblePhase('understand')).toBe('listen');
    expect(PHASE_LABELS.understand).toBe('Listen');
    expect(phaseProgressPct('understand')).toBe(0);
  });

  it('progress runs Listen → Memorize → Test → Done', () => {
    expect(['listen', 'chunk', 'test', 'complete'].map((p) => Math.round(phaseProgressPct(p as never)))).toEqual([0, 33, 67, 100]);
    expect(PHASE_LABELS.chunk).toBe('Memorize');
  });
});
