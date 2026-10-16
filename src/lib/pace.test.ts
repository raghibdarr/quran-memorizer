import { describe, expect, it } from 'vitest';
import { ayahDurationMs, paceRatio, paceSentence, reciterProgress } from './pace';

describe('pace', () => {
  it('measures an ayah from its first word to its last', () => {
    expect(ayahDurationMs([[1, 100, 600], [2, 700, 1500], [3, 1600, 3100]])).toBe(3000);
    expect(ayahDurationMs([])).toBeNull();
  });
  it('compares your time with the reciter’s', () => {
    expect(paceRatio(6000, 9000)).toBe(1.5);
    expect(paceRatio(9000, 9000)).toBe(1);
    expect(paceRatio(1000, 9000)).toBeNull(); // too short to judge
  });
  it('words it gently, flagging only real rushing', () => {
    expect(paceSentence(1.5, 'Mishary Alafasy')).toMatch(/1\.5× as fast/);
    expect(paceSentence(1.1, 'Mishary Alafasy')).toMatch(/close to/);
    expect(paceSentence(0.6, 'Mishary Alafasy')).toMatch(/more slowly/);
    expect(paceSentence(null, 'x')).toBeNull();
  });
  it('places the reciter along the passage by time, clamped', () => {
    expect(reciterProgress(5000, 10000)).toBe(0.5);
    expect(reciterProgress(20000, 10000)).toBe(1);
  });
});
