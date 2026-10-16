// Writes the two English translations into src/data/surah-N.json from the verbatim
// source files in data-sources/ (licensing audit, 2026-10-16: nothing from api.quran.com):
//   translation     Saheeh International, from QuranEnc (english_saheeh). Kept exactly as
//                   published, footnote markers like [2] included; their notes go in
//                   `footnotes`. QuranEnc's terms: no changes, name QuranEnc and the version.
//   translationClear  The Clear Quran (Allah edition) by Talal Itani, CC BY-ND 4.0 with the
//                   author's extra permissions; credit "Translation by Talal Itani, ClearQuran.com".
// The versions go to src/data/translation-sources.json for the credits.
// Run: node scripts/build-translations.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (...p) => join(root, 'data-sources', ...p);

/** RFC 4180 CSV: quoted fields may hold commas, doubled quotes and newlines */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Saheeh International (QuranEnc)
const csv = readFileSync(src('quranenc', 'english_saheeh.csv'), 'utf8');
const version = csv.match(/Last update: ([^\n]+)/)?.[1].trim() ?? '';
const rows = parseCsv(csv);
const head = rows.findIndex((r) => r[0] === 'id' && r[1] === 'sura');
const saheeh = new Map();
for (const r of rows.slice(head + 1)) {
  if (r.length < 4 || !r[1]) continue;
  const notes = {};
  for (const m of (r[4] ?? '').matchAll(/\[(\d+)\]\s*([\s\S]*?)(?=\n?\[\d+\]|$)/g)) notes[m[1]] = m[2].trim();
  saheeh.set(`${r[1]}:${r[2]}`, { text: r[3].trim(), notes });
}

// The Clear Quran: "surah|ayah|text" lines, then a commented licence block
const clear = new Map();
for (const line of readFileSync(src('clearquran', 'clearquran-allah-edition.txt'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^(\d+)\|(\d+)\|(.*)$/);
  if (m) clear.set(`${m[1]}:${m[2]}`, m[3].trim());
}
const clearUpdated = readFileSync(src('clearquran', 'clearquran-allah-edition.txt'), 'utf8').match(/Last Update: ([^\n]+)/)?.[1].trim() ?? '';

let ayahs = 0;
for (let s = 1; s <= 114; s++) {
  const file = join(root, 'src', 'data', `surah-${s}.json`);
  const surah = JSON.parse(readFileSync(file, 'utf8'));
  for (const a of surah.ayahs) {
    const key = `${s}:${a.number}`;
    const sh = saheeh.get(key), cl = clear.get(key);
    if (!sh || !cl) throw new Error(`missing translation for ${key}`);
    a.translation = sh.text;
    if (Object.keys(sh.notes).length) a.footnotes = sh.notes; else delete a.footnotes;
    a.translationClear = cl;
    ayahs++;
  }
  writeFileSync(file, JSON.stringify(surah, null, 2));
}
if (ayahs !== 6236) throw new Error(`expected 6236 ayahs, wrote ${ayahs}`);

writeFileSync(join(root, 'src', 'data', 'translation-sources.json'), JSON.stringify({
  saheeh: { name: 'Saheeh International', source: 'QuranEnc.com', url: 'https://quranenc.com/en/browse/english_saheeh', version },
  clear: { name: 'The Clear Quran', translator: 'Talal Itani', url: 'https://clearquran.com', license: 'CC BY-ND 4.0', updated: clearUpdated },
}, null, 2) + '\n');
console.log(`translations: ${ayahs} ayahs; Saheeh ${version}; Clear Quran ${clearUpdated}`);
