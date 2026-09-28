import { describe, expect, it } from 'vitest';
import { mapWordIndex, resampleTo16k } from './voice-tracker';

describe('voice tracker helpers', () => {
  it('maps engine word indices onto ours, including the few ayahs split differently', () => {
    expect(mapWordIndex(2, 4, 4)).toBe(2);
    expect(mapWordIndex(13, 14, 13)).toBe(12); // 2:181: engine has one more word
    expect(mapWordIndex(0, 14, 13)).toBe(0);
    expect(mapWordIndex(9, 4, 4)).toBe(3); // never out of range
  });

  it('resamples 48 kHz to 16 kHz by a third, and passes 16 kHz through', () => {
    const one = new Float32Array(4800).fill(0.5);
    expect(resampleTo16k(one, 48000).length).toBe(1600);
    expect(resampleTo16k(one, 48000)[100]).toBeCloseTo(0.5);
    expect(resampleTo16k(one, 16000).length).toBe(4800);
  });
});
