#!/usr/bin/env node
// Applies a per-ayah reciter's audio fixes, found by the aligner's file check
// (scripts/aligner/check_audio.py, remap_khalefa.py): EveryAyah files that hold the wrong
// ayah, two ayahs, or part of one. Writes
//   public/segments/<reciter>/audio-fixes.json  { "<s>:<a>": [srcUrl, startMs, endMs] }
// (the ayah plays as that slice; src is an EveryAyah file or the same reciter's surah file
// on mp3quran.net) and replaces those ayahs' word timings, relative to the slice start.
//
// Usage: node scripts/apply-audio-fixes.mjs <reciter> <aligner out folder for that reciter>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [reciter, dir] = process.argv.slice(2);
if (!reciter || !dir || !existsSync(dir)) {
  console.error('Usage: node scripts/apply-audio-fixes.mjs <reciter> <aligner out folder>');
  process.exit(1);
}
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const report = read('_report.json');
const missing = read('_missing.json');
const ea = (file) => `https://everyayah.com/data/${reciter}/${file}.mp3`;

const fixes = {};
const timings = {}; // "<s>:<a>" -> rows relative to the slice start

// Ayahs whose audio is in another EveryAyah file (whole file, or the tail of one)
for (const [ref, r] of Object.entries(report.remapped ?? {})) {
  const [s, a] = ref.split(':');
  const staged = read(`${s}.json`)[a];
  const shared = r.fileHolds && r.fileHolds.length > 1 && r.fileHolds[0] !== ref; // e.g. 34:48 in 034047 after 34:47
  const start = shared ? r.startMs : 0;
  fixes[ref] = [ea(r.file), start, r.fileDurationMs];
  timings[ref] = staged.map(([w, b, e]) => [w, b - start, e - start]);
}
// Ayahs that keep their own file but must stop early (it runs on into the next ayah)
for (const [ref, n] of Object.entries(report.notes ?? {})) {
  if (!n.ayahEndsMs) continue;
  fixes[ref] = [ea(n.file), 0, n.ayahEndsMs];
  if (n.rows) timings[ref] = n.rows;
}
// Ayahs with no EveryAyah file: a slice of the same reciter's mp3quran surah file
for (const [ref, m] of Object.entries(missing.ayahs ?? {})) {
  fixes[ref] = [m.source, m.startMs, m.endMs];
  timings[ref] = m.words;
}

const segDir = join(root, 'public', 'segments', reciter);
writeFileSync(join(segDir, 'audio-fixes.json'), JSON.stringify(Object.fromEntries(Object.entries(fixes).sort())) + '\n');
const bySurah = {};
for (const [ref, rows] of Object.entries(timings)) { const [s, a] = ref.split(':'); (bySurah[s] ??= {})[a] = rows; }
for (const [s, rows] of Object.entries(bySurah)) {
  const path = join(segDir, `${s}.json`);
  const cur = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  Object.assign(cur, rows);
  writeFileSync(path, JSON.stringify(Object.fromEntries(Object.entries(cur).sort((x, y) => Number(x[0]) - Number(y[0])))));
}
console.log(`${reciter}: ${Object.keys(fixes).length} audio fixes, timings for ${Object.keys(timings).length} ayahs in surahs ${Object.keys(bySurah).join(', ')}`);
