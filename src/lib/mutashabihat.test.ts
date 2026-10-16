import { describe, expect, it } from 'vitest';
import data from '@/data/mutashabihat.json';

type Twin = { k: string; d: number[]; t: number[] };
const twins = data as Record<string, Twin[]>;
const twinKeys = (key: string) => (twins[key] ?? []).map((t) => t.k);

describe('similar-ayah data (scripts/build-mutashabihat.mjs)', () => {
  it('pairs the classic mutashabihat', () => {
    expect(twinKeys('2:35')).toContain('7:19');   // Adam and his wife in the garden
    expect(twinKeys('2:58')).toContain('7:161');  // "enter this town"
    expect(twinKeys('2:34')).toEqual(expect.arrayContaining(['20:116'])); // Iblis refuses
  });

  it('marks the words that differ, on both sides', () => {
    const pair = twins['2:35'].find((t) => t.k === '7:19')!;
    expect(pair.d).toEqual([0, 1, 6, 7, 8]); // وَقُلْنَا يَـٰٓـَٔادَمُ … وَكُلَا مِنْهَا رَغَدًا
    expect(pair.t).toEqual([0, 5, 6]);       // وَيَـٰٓـَٔادَمُ … فَكُلَا مِنْ
  });

  it('is symmetric and leaves out verbatim repeats', () => {
    for (const [key, list] of Object.entries(twins)) {
      for (const t of list) {
        expect(t.d.length + t.t.length).toBeGreaterThan(0);
        const back = (twins[t.k] ?? []).find((x) => x.k === key);
        if (back) expect(back.d).toEqual(t.t);
      }
    }
    expect(twins['55:13']).toBeUndefined(); // the refrain, identical every time
  });
});
