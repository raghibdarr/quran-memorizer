import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { morphParts } from './morph';

const twins = JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'mutashabihat.json'), 'utf8')) as Record<string, { k: string; d: number[]; t: number[] }[]>;
const surahs = new Map<number, { ayahs: { words: { charType: string }[] }[] }>();
const wordCount = (key: string) => {
  const [s, a] = key.split(':').map(Number);
  if (!surahs.has(s)) surahs.set(s, JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', `surah-${s}.json`), 'utf8')));
  return surahs.get(s)!.ayahs[a - 1].words.filter((w) => w.charType === 'word').length;
};

describe('morphParts', () => {
  it('2:35 into 7:19: shared words pair up, the differences group', () => {
    const t = twins['2:35'][0];
    expect(t.k).toBe('7:19');
    const parts = morphParts(wordCount('2:35'), t.d, wordCount('7:19'), t.t)!;
    expect(parts).not.toBeNull();
    // وَقُلْنَا يَـٰٓـَٔادَمُ → وَيَـٰٓـَٔادَمُ, then ٱسْكُنْ … shared
    expect(parts[0]).toEqual({ kind: 'diff', a: [0, 1], b: [0] });
    expect(parts[1]).toEqual({ kind: 'same', a: 2, b: 1 });
    // every word of both ayahs appears exactly once
    const a = parts.flatMap((p) => (p.kind === 'same' ? [p.a] : p.a));
    const b = parts.flatMap((p) => (p.kind === 'same' ? [p.b] : p.b));
    expect(a).toEqual([...Array(wordCount('2:35')).keys()]);
    expect(b).toEqual([...Array(wordCount('7:19')).keys()]);
  });

  it('every pair in the data morphs (or reports it cannot)', () => {
    let ok = 0, total = 0;
    for (const [key, list] of Object.entries(twins)) {
      for (const t of list) {
        total++;
        if (morphParts(wordCount(key), t.d, wordCount(t.k), t.t)) ok++;
      }
    }
    expect(ok / total).toBeGreaterThan(0.95);
  });

  it('refuses when the shared words do not pair up', () => {
    expect(morphParts(4, [0], 4, [])).toBeNull();
  });
});
