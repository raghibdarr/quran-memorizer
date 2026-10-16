#!/usr/bin/env node
// Builds the offline search index and the mushaf metadata from Tanzil (roadmap #04).
//
//   src/data/search-index.json  Tanzil "Simple Clean" text, one VERBATIM line per ayah
//                               (Tanzil's terms forbid changing it; search normalises
//                               at run time, src/lib/search.ts), plus our translation
//   src/data/quran-meta.json    page / juz / hizb-quarter / sajda starts (Tanzil metadata)
//
// Both are Tanzil Project, CC BY 3.0: credited in Settings with a link to tanzil.net.
//
// Usage: node scripts/build-search-index.mjs [--from <dir with simple-clean.txt and quran-data.js>]

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const TEXT_URL = 'https://tanzil.net/pub/download/index.php?marks=true&sajdah=true&rub=true&alif=true&quranType=simple-clean&outType=txt-2&agree=true';
const META_URL = 'https://tanzil.net/res/text/metadata/quran-data.js';

const fromIdx = process.argv.indexOf('--from');
const from = fromIdx > 0 ? process.argv[fromIdx + 1] : null;

async function load(file, url) {
  if (from) return fs.readFileSync(path.join(from, file), 'utf8');
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Takrar build)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const raw = await load('simple-clean.txt', TEXT_URL);
const lines = raw.split(/\r?\n/);
const verses = lines.filter((l) => /^\d+\|\d+\|/.test(l));
if (verses.length !== 6236) throw new Error(`expected 6236 ayahs, got ${verses.length}`);
const notice = lines.filter((l) => l.startsWith('#')).map((l) => l.replace(/^#\s?/, '')).join('\n').trim();
if (!/Tanzil/.test(notice)) throw new Error('Tanzil copyright notice missing');

const arabic = [];
const counts = [];
for (const v of verses) {
  const [s, a, text] = v.split('|');
  const surah = Number(s);
  counts[surah - 1] = Math.max(counts[surah - 1] ?? 0, Number(a));
  arabic.push(text);
}

// Our translation, in the same order (stripped of footnote markup)
const translation = [];
for (let s = 1; s <= 114; s++) {
  const data = JSON.parse(fs.readFileSync(`src/data/surah-${s}.json`, 'utf8'));
  if (data.ayahs.length !== counts[s - 1]) throw new Error(`surah ${s}: ${data.ayahs.length} ayahs vs Tanzil ${counts[s - 1]}`);
  for (const a of data.ayahs) translation.push(String(a.translation ?? '').replace(/<sup[^>]*>.*?<\/sup>/g, '').replace(/<[^>]+>/g, '').trim());
}

fs.writeFileSync('src/data/search-index.json', JSON.stringify({
  source: 'Tanzil Quran Text (Simple Clean, Version 1.1), tanzil.net. Verbatim; translation: Sahih International.',
  notice,
  counts,
  arabic,
  translation,
}));

// Metadata: evaluate Tanzil's data file in a sandbox and keep the starts we use
const metaSrc = await load('quran-data.js', META_URL);
const ctx = { QuranData: {} };
vm.runInNewContext(metaSrc.replace(/^var QuranData = \{\};/m, ''), ctx);
const Q = ctx.QuranData;
const pairs = (list) => list.filter((x) => Array.isArray(x) && x.length >= 2).map(([s, a]) => [s, a]);
const meta = {
  source: 'Tanzil Quran Metadata (ver 1.0), tanzil.net, CC BY 3.0',
  page: pairs(Q.Page).slice(0, 604), // start of each Madani page
  juz: pairs(Q.Juz).slice(0, 30),
  hizbQuarter: pairs(Q.HizbQaurter).slice(0, 240),
  sajda: pairs(Q.Sajda),
};
if (meta.page.length !== 604 || meta.juz.length !== 30 || meta.hizbQuarter.length !== 240) throw new Error('unexpected metadata shape');
fs.writeFileSync('src/data/quran-meta.json', JSON.stringify(meta));
console.log(`search-index.json: ${arabic.length} ayahs · quran-meta.json: ${meta.page.length} pages, ${meta.sajda.length} sajdas`);
