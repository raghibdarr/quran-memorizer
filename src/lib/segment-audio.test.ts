import { describe, expect, it } from 'vitest';
import { wordAtTime } from './segment-audio';

const ayah: [number, number, number][] = [[1, 100, 600], [2, 700, 1200], [3, 1300, 2400]];

describe('wordAtTime', () => {
  it('follows the recitation word by word', () => {
    expect(wordAtTime(ayah, 50)).toBe(-1);
    expect(wordAtTime(ayah, 100)).toBe(0);
    expect(wordAtTime(ayah, 900)).toBe(1);
    expect(wordAtTime(ayah, 2000)).toBe(2);
  });

  it('holds the last word through a pause and after the end', () => {
    expect(wordAtTime(ayah, 650)).toBe(0);
    expect(wordAtTime(ayah, 5000)).toBe(2);
  });

  it('copes with a word the aligner missed (gap in numbering)', () => {
    expect(wordAtTime([[1, 0, 300], [3, 800, 1200]], 900)).toBe(2);
    expect(wordAtTime(undefined, 500)).toBe(-1);
  });
});
