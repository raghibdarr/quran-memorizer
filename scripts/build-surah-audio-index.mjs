#!/usr/bin/env node
// For each surah-audio reciter (QUD), gathers the surah file URLs and every ayah's
// [startMs, endMs] inside them into one small file, public/segments/<id>/audio-index.json,
// so the recitation player can queue many surahs (to the end of a juz, or of the
// Quran) with one fetch instead of one per surah. Rebuild after scripts/import-qud.mts.
//
//   { src: [url per surah, null when missing], verses: [[[start, end] | null per ayah] per surah] }

import fs from 'node:fs';
import path from 'node:path';

const reciters = JSON.parse(fs.readFileSync('src/data/qud-reciters.json', 'utf8'));
for (const { id } of reciters) {
  const dir = path.join('public', 'segments', id);
  const src = [];
  const verses = [];
  let ayahs = 0;
  for (let s = 1; s <= 114; s++) {
    const file = path.join(dir, `${s}.json`);
    const audio = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8'))._audio : null;
    src.push(audio?.src ?? null);
    const meta = JSON.parse(fs.readFileSync(`src/data/surah-${s}.json`, 'utf8'));
    verses.push(meta.ayahs.map((a) => {
      const v = audio?.verses?.[String(a.number)];
      if (v) ayahs++;
      return v ? [Math.round(v[0]), Math.round(v[1])] : null;
    }));
  }
  fs.writeFileSync(path.join(dir, 'audio-index.json'), JSON.stringify({ src, verses }));
  console.log(`${id}: ${ayahs} ayahs`);
}
