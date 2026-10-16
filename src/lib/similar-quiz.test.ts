import { describe, expect, it } from 'vitest';
import data from '@/data/mutashabihat.json';
import { answers, pickPairs, shuffle, type TwinMap } from './similar-quiz';

const twins = data as unknown as TwinMap;

describe('similar-ayah practice', () => {
  it('shuffles deterministically and keeps every item', () => {
    expect(shuffle([1, 2, 3, 4, 5], 7).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(shuffle([1, 2, 3, 4, 5], 7)).toEqual(shuffle([1, 2, 3, 4, 5], 7));
  });

  it('only asks about known ayahs, once per pair, pairs where both are known first', () => {
    const known = new Set(['2:35', '7:19', '2:58']);
    const pairs = pickPairs(twins, (k) => known.has(k), 10, 3);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) expect(known.has(p.key)).toBe(true);
    const ids = pairs.map((p) => [p.key, p.twin].sort().join('|'));
    expect(new Set(ids).size).toBe(ids.length);
    const firstBoth = pairs.findIndex((p) => known.has(p.twin));
    const firstOne = pairs.findIndex((p) => !known.has(p.twin));
    if (firstBoth >= 0 && firstOne >= 0) expect(firstBoth).toBeLessThan(firstOne);
  });

  it('offers the ayah\'s own words against its twin\'s', () => {
    const a = answers({ key: '2:35', blanks: [1], twin: '7:19', twinWords: [1] }, ['w0', 'mine', 'w2'], ['t0', 'theirs', 't2']);
    expect(a).toEqual({ right: 'mine', wrong: 'theirs' });
    expect(answers({ key: 'x', blanks: [0], twin: 'y', twinWords: [0] }, ['same'], ['same'])).toBeNull();
  });
});
