// Writes the Uthmani text in src/data/surah-N.json from Tanzil's verbatim files in
// data-sources/tanzil (licensing audit, 2026-10-16: nothing from api.quran.com):
//   ayah.textUthmani      quran-uthmani.xml, the ayah exactly as Tanzil publishes it
//   word.textUthmani      quran-uthmani-small-tanween.xml split on spaces, with each pause
//                         mark kept on the word before it and the rub el hizb sign on the
//                         word after it (how the lessons show and time words)
// Each word's old audio.qurancdn.com link is dropped (word audio is cut from the ayah
// recording instead). The word positions are unchanged, so word timings, tajweed and progress still line up;
// --check compares against the current files instead of writing.
// Tanzil Quran Text, CC BY 3.0, verbatim; credited in Settings with a link to tanzil.net.
// Run: node scripts/build-arabic-text.mjs [--check]
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

function loadTanzil(file) {
  const xml = readFileSync(join(root, 'data-sources', 'tanzil', file), 'utf8');
  const text = new Map();
  for (const s of xml.matchAll(/<sura index="(\d+)"[^>]*>([\s\S]*?)<\/sura>/g))
    for (const a of s[2].matchAll(/<aya index="(\d+)" text="([^"]*)"/g)) text.set(`${s[1]}:${a[1]}`, a[2]);
  if (text.size !== 6236) throw new Error(`${file}: ${text.size} ayahs`);
  return text;
}

/** Pause marks (U+06D6–06DC) and the sajdah sign (U+06E9) stay on the word before them */
const PAUSE = new RegExp('^[\\u06D6-\\u06DC\\u06E9]$');
const RUB = String.fromCharCode(0x06de);
/** Words Tanzil splits in two that the lessons treat as one (index of the first token) */
const JOINED = { '2:181': [2], '8:6': [3], '13:37': [7], '37:130': [2] };

export function wordsOf(key, text) {
  const words = [];
  let rub = false;
  for (const t of text.split(' ')) {
    if (t === RUB) { rub = true; continue; }
    if (PAUSE.test(t) && words.length) { words[words.length - 1] += ` ${t}`; continue; }
    words.push(rub ? `${RUB} ${t}` : t);
    rub = false;
  }
  // Join from the end so earlier indexes stay valid
  for (const i of [...(JOINED[key] ?? [])].sort((a, b) => b - a)) words.splice(i, 2, `${words[i]} ${words[i + 1]}`);
  return words;
}

const ayahText = loadTanzil('quran-uthmani.xml');
const wordText = loadTanzil('quran-uthmani-small-tanween.xml');

let diffs = 0, words = 0;
for (let s = 1; s <= 114; s++) {
  const file = join(root, 'src', 'data', `surah-${s}.json`);
  const surah = JSON.parse(readFileSync(file, 'utf8'));
  for (const a of surah.ayahs) {
    const text = ayahText.get(a.key);
    if (a.textUthmani.trim() !== text && diffs++ < 5) console.log(`ayah ${a.key} differs`);
    a.textUthmani = text;
    const ws = wordsOf(a.key, wordText.get(a.key));
    const real = a.words.filter((w) => w.charType === 'word');
    if (real.length !== ws.length) throw new Error(`${a.key}: ${real.length} words vs ${ws.length} from Tanzil`);
    real.forEach((w, i) => {
      if (w.textUthmani !== ws[i] && diffs++ < 40) console.log(`word ${a.key}#${i + 1}: ${w.textUthmani} → ${ws[i]}`);
      w.textUthmani = ws[i];
      words++;
    });
    // Word audio is cut from the ayah recording now (src/lib/word-audio.ts), not
    // fetched from audio.qurancdn.com
    for (const w of a.words) delete w.audioUrl;
  }
  if (!check) writeFileSync(file, JSON.stringify(surah, null, 2));
}
console.log(`${check ? 'checked' : 'wrote'} 6236 ayahs and ${words} words from Tanzil; ${diffs} differ from before`);
