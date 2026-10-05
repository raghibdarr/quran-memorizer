// Re-numbers every reciter's word timings in public/segments to OUR word list (see
// src/lib/align-timings.ts for why). Idempotent: aligned ayahs come out unchanged.
// Run after scripts/import-segments.mjs, or any new timing source (QUD):
//   node --experimental-strip-types scripts/align-segments.mts
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignAyah, type Row, type AlignMethod } from '../src/lib/align-timings.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const segRoot = join(root, 'public', 'segments');

const words = new Map<number, Map<number, string[]>>();
for (let s = 1; s <= 114; s++) {
  const surah = JSON.parse(readFileSync(join(root, 'src', 'data', `surah-${s}.json`), 'utf8'));
  const m = new Map<number, string[]>();
  for (const a of surah.ayahs) m.set(a.number, a.words.filter((w: { charType: string }) => w.charType === 'word').map((w: { textUthmani: string }) => w.textUthmani));
  words.set(s, m);
}

const manifestPath = join(segRoot, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

for (const reciter of readdirSync(segRoot).filter((d) => statSync(join(segRoot, d)).isDirectory())) {
  const count: Record<AlignMethod, number> = { exact: 0, split: 0, proportional: 0, short: 0 };
  const proportional: string[] = [];
  for (const file of readdirSync(join(segRoot, reciter)).filter((f) => f.endsWith('.json'))) {
    const s = Number(file.replace('.json', ''));
    const path = join(segRoot, reciter, file);
    const timings: Record<string, Row[]> = JSON.parse(readFileSync(path, 'utf8'));
    for (const [ayah, rows] of Object.entries(timings)) {
      const ours = words.get(s)?.get(Number(ayah));
      if (!ours) continue;
      const out = alignAyah(ours, rows);
      count[out.method]++;
      if (out.method === 'proportional') proportional.push(`${s}:${ayah}`);
      timings[ayah] = out.rows;
    }
    writeFileSync(path, JSON.stringify(timings));
  }
  console.log(`${reciter}: ${JSON.stringify(count)}${proportional.length ? ` proportional: ${proportional.join(' ')}` : ''}`);
  if (manifest.reciters?.[reciter]) manifest.reciters[reciter].alignedToOurWords = { ...count, at: new Date().toISOString().slice(0, 10) };
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
