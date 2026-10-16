// Writes our own transliterations into src/data/surah-N.json (licensing audit, 2026-10-16:
// the word ones came from api.quran.com and the ayah ones from QUL; src/lib/transliterate.ts
// makes both from Tanzil's text instead):
//   word.transliteration   the word read on its own
//   ayah.transliteration   the ayah read as recited, joined across words, stopping at the end
// Run: npx tsx scripts/build-transliteration.mts
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { transliterateAyah, transliterateWord } from '../src/lib/transliterate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let words = 0;
for (let s = 1; s <= 114; s++) {
  const file = join(root, 'src', 'data', `surah-${s}.json`);
  const surah = JSON.parse(readFileSync(file, 'utf8'));
  for (const a of surah.ayahs) {
    const real = a.words.filter((w: { charType: string }) => w.charType === 'word');
    for (const w of real) { w.transliteration = transliterateWord(w.textUthmani); words++; }
    for (const w of a.words) if (w.charType !== 'word') w.transliteration = null;
    a.transliteration = transliterateAyah(real.map((w: { textUthmani: string }) => w.textUthmani));
  }
  writeFileSync(file, JSON.stringify(surah, null, 2));
}
console.log(`transliterated 6236 ayahs and ${words} words`);
