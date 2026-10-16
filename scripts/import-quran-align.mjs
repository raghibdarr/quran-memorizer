// Imports word timings from quran-align by Colin Fair (CC BY 4.0,
// https://github.com/cpfair/quran-align, release 2016-11-24) into
// public/segments/{everyayahDir}/{surah}.json, for reciters played as EveryAyah's per-ayah
// files. quran-align timed exactly those files, word by word over Tanzil's Uthmani text.
// (Licensing audit, 2026-10-16: replaces the copies exported from QUL, which shows no
// licence; QUL's own were derived from quran-align.)
// Usage: node scripts/import-quran-align.mjs <folder with the release's JSON files>
// THEN run: node --experimental-strip-types scripts/align-segments.mts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'public', 'segments');
const srcDir = process.argv[2];
if (!srcDir || !existsSync(srcDir)) {
  console.error('Usage: node scripts/import-quran-align.mjs <folder with quran-align JSON files>');
  process.exit(1);
}

/** quran-align file → the EveryAyah directory Takrar plays. Abdul Basit was timed on the
 *  64kbps encode of the same recording we play at 192kbps */
const FILES = {
  'Alafasy_128kbps.json': 'Alafasy_128kbps',
  'Minshawy_Murattal_128kbps.json': 'Minshawy_Murattal_128kbps',
  'Abdul_Basit_Murattal_64kbps.json': 'Abdul_Basit_Murattal_192kbps',
  'Abu_Bakr_Ash-Shaatree_128kbps.json': 'Abu_Bakr_Ash-Shaatree_128kbps',
  'Abdul_Basit_Mujawwad_128kbps.json': 'Abdul_Basit_Mujawwad_128kbps',
  'Husary_Muallim_128kbps.json': 'Husary_Muallim_128kbps',
  'Minshawy_Mujawwad_192kbps.json': 'Minshawy_Mujawwad_192kbps',
  'Mohammad_al_Tablaway_128kbps.json': 'Mohammad_al_Tablaway_128kbps',
};

const manifestPath = join(outRoot, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { reciters: {} };
manifest.source = 'quran-align by Colin Fair, CC BY 4.0 (https://github.com/cpfair/quran-align), for EveryAyah per-ayah reciters; '
  + "Qur'anic Universal Audio by QUD, CC BY 4.0, for surah-audio reciters";

for (const [file, dir] of Object.entries(FILES)) {
  const path = join(srcDir, file);
  if (!existsSync(path)) { console.warn(`skip ${file}: not in ${srcDir}`); continue; }
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const bySurah = new Map();
  let rows = 0, multi = 0;
  const missing = [];
  for (const { surah, ayah, segments } of data) {
    // A few ayahs failed to align upstream (Minshawy Mujawwad 32:24): they play whole
    if (!Array.isArray(segments) || !segments.length) { missing.push(`${surah}:${ayah}`); continue; }
    const out = [];
    for (const [from, to, start, end] of segments) {
      // A segment spanning several words is shared out evenly; align-segments.mts then
      // renumbers every row to our word list
      const n = Math.max(1, to - from);
      if (n > 1) multi++;
      for (let k = 0; k < n; k++) {
        const s = Math.round(start + ((end - start) * k) / n), e = Math.round(start + ((end - start) * (k + 1)) / n);
        out.push([from + k + 1, s, e]);
      }
    }
    rows += out.length;
    if (!bySurah.has(surah)) bySurah.set(surah, {});
    bySurah.get(surah)[String(ayah)] = out;
  }
  const outDir = join(outRoot, dir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [surah, timings] of bySurah) writeFileSync(join(outDir, `${surah}.json`), JSON.stringify(timings));
  manifest.reciters[dir] = { importedFrom: `quran-align ${file} (release 2016-11-24)`, ayahsWithSegments: data.length - missing.length, ayahsMissingSegments: missing, segmentRows: rows, multiWordSegmentsSplit: multi };
  console.log(`${dir}: ${data.length - missing.length} ayahs, ${rows} rows (${multi} multi-word segments split)${missing.length ? `, no timings for ${missing.join(' ')}` : ''}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
