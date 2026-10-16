// Writes textIndopak in src/data/surah-N.json from DigitalKhatt's IndoPak text (MIT,
// data-sources/digitalkhatt; licensing audit 2026-10-16: nothing from api.quran.com). The
// app draws it in DigitalKhatt's IndoPak font (OFL, public/mushaf/indopak-qmh.woff2).
// The source is the 15-line mushaf's pages; each ayah ends at an end-of-ayah sign. A
// surah's first segment is its basmala (Al-Fatihah's is its first ayah; At-Tawbah has
// none). The printed ayah numbers are dropped (IndoPak counts some differently) and any
// pause sign after the number stays on the last word.
// Run: node scripts/build-indopak.mjs [--check]
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const END = String.fromCharCode(0x6dd);
const DIGITS = `${String.fromCharCode(0x660)}-${String.fromCharCode(0x669)}${String.fromCharCode(0x6f0)}-${String.fromCharCode(0x6f9)}`;
const NBSP = String.fromCharCode(0xa0);
/** Words the lessons count as one though the text spaces them (index of the first) */
const JOINED = { '2:181': [2], '8:6': [3], '13:37': [7], '72:16': [0] };

const src = readFileSync(join(root, 'data-sources', 'digitalkhatt', 'quran_text_indopak_15.ts'), 'utf8');
const pages = new Function(src.replace(/^\s*let quranText\s*=/, 'return ').replace(/;?\s*export[\s\S]*$/, ''))();
const segments = {};
let surah = 0, cur = [];
for (const line of pages.flat()) {
  if (/^سُورَةُ /.test(line.trim())) { surah++; segments[surah] = []; cur = []; continue; }
  for (const tok of line.split(' ')) {
    if (!tok) continue;
    cur.push(tok);
    if (tok.startsWith(END)) { segments[surah].push(cur.join(' ')); cur = []; }
  }
}

const LETTER = new RegExp(`[${String.fromCharCode(0x621)}-${String.fromCharCode(0x64a)}${String.fromCharCode(0x671)}-${String.fromCharCode(0x6d3)}]`);
let mismatched = 0;
for (let s = 1; s <= 114; s++) {
  const file = join(root, 'src', 'data', `surah-${s}.json`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const segs = s === 1 || s === 9 ? segments[s] : segments[s].slice(1);
  if (segs.length !== data.ayahs.length) throw new Error(`surah ${s}: ${segs.length} IndoPak ayahs vs ${data.ayahs.length}`);
  data.ayahs.forEach((a, i) => {
    let words = segs[i].replace(new RegExp(`\s*${END}[${DIGITS}]*`, 'g'), '').trim().split(' ');
    for (const j of [...(JOINED[a.key] ?? [])].sort((x, y) => y - x)) words.splice(j, 2, `${words[j]}${NBSP}${words[j + 1]}`);
    a.textIndopak = words.join(' ');
    const real = a.words.filter((w) => w.charType === 'word').length;
    if (words.filter((w) => LETTER.test(w)).length !== real) mismatched++;
  });
  if (!check) writeFileSync(file, JSON.stringify(data, null, 2));
}
console.log(`${check ? 'checked' : 'wrote'} IndoPak text for 6236 ayahs; ${mismatched} don't split into the same words`);
