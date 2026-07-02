// Generates src/data/ayah-weights.json: per-ayah real-word counts for every surah,
// used by curriculum.ts to pack lessons to a memorization-load budget instead of a
// flat ayah count. Run after any surah-data refresh:
//   node scripts/generate-ayah-weights.mjs
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src', 'data');

const weights = {};
for (const f of readdirSync(dataDir)) {
  const m = f.match(/^surah-(\d+)\.json$/);
  if (!m) continue;
  const surah = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
  weights[m[1]] = surah.ayahs.map(
    (a) => a.words.filter((w) => w.charType === 'word').length
  );
}

const ordered = Object.fromEntries(
  Object.entries(weights).sort(([a], [b]) => Number(a) - Number(b))
);
writeFileSync(join(dataDir, 'ayah-weights.json'), JSON.stringify(ordered));
const totals = Object.values(ordered).flat();
console.log(
  `surahs: ${Object.keys(ordered).length}, ayahs: ${totals.length}, words: ${totals.reduce((a, b) => a + b, 0)}`
);
