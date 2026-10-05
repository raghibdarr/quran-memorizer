// Imports QUL bulk-download "ayah recitation with segments" JSON files (from a free
// qul.tarteel.ai account) into public/segments/{everyayahDir}/{surah}.json.
// Usage: node scripts/import-segments.mjs "C:\path\to\downloaded\folder"
// THEN run scripts/align-segments.mts: sources number some words differently from ours.
//
// Safety rails:
// - Reciters are identified by the audio_url slug inside the file (filenames lie);
//   unknown slugs are skipped loudly (e.g. husaryMuallim is NOT everyayah's Murattal).
// - Word numbering is validated against our per-ayah word counts (ayah-weights.json).
// - A sample of QUL audio_urls is HEAD-compared against the matching everyayah file
//   (byte size) — timestamps only make sense against identical audio.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'public', 'segments');
const srcDir = process.argv[2];
if (!srcDir || !existsSync(srcDir)) {
  console.error('Usage: node scripts/import-segments.mjs <folder with QUL json files>');
  process.exit(1);
}

// audio-cdn.tarteel.ai slug -> everyayah directory (verified byte-identical audio)
const SLUG_TO_DIR = {
  alafasy: 'Alafasy_128kbps',
  husary: 'Husary_128kbps',
  abdulBasitMurattal: 'Abdul_Basit_Murattal_192kbps',
  minshawyMurattal: 'Minshawy_Murattal_128kbps',
  yasserAlDosari: 'Yasser_Ad-Dussary_128kbps',
  maherAlMuaiqly: 'MaherAlMuaiqly128kbps',
};

const VERIFY_SAMPLES = 12;
const weights = JSON.parse(readFileSync(join(root, 'src', 'data', 'ayah-weights.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function headLen(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? Number(res.headers.get('content-length')) : null;
  } catch {
    return null;
  }
}

function normalizeRow(row) {
  if (!Array.isArray(row)) return null;
  if (row.length >= 4) return [row[1], row[2], row[3]];
  if (row.length === 3) return [row[0], row[1], row[2]];
  return null;
}

const manifest = existsSync(join(outRoot, 'manifest.json'))
  ? JSON.parse(readFileSync(join(outRoot, 'manifest.json'), 'utf8'))
  : { source: 'https://qul.tarteel.ai (Tarteel QUL); original alignments: quran-align by Colin Fair (CC BY 4.0)', reciters: {} };
manifest.importedAt = new Date().toISOString().slice(0, 10);

for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(join(srcDir, file), 'utf8'));
  const entries = Object.entries(data);
  if (!entries.length) { console.log(`SKIP ${file}: empty`); continue; }

  // Identify the reciter from the audio_url slug, and require it to be consistent
  const slugOf = (rec) => rec?.audio_url?.match(/audio-cdn\.tarteel\.ai\/quran\/([^/]+)\//)?.[1] ?? null;
  const slug = slugOf(entries[0][1]);
  const dir = SLUG_TO_DIR[slug];
  if (!dir) {
    console.log(`SKIP ${file}: audio slug "${slug}" is not a Takrar reciter (wrong edition? e.g. Muallim/Mujawwad)`);
    continue;
  }
  const inconsistent = entries.some(([, rec]) => slugOf(rec) !== slug);
  if (inconsistent) { console.log(`SKIP ${file}: mixed audio slugs — refusing`); continue; }

  console.log(`\n=== ${file} -> ${dir} (${entries.length} ayahs)`);
  mkdirSync(join(outRoot, dir), { recursive: true });

  const bySurah = {};
  let rows = 0, dropped = 0, missingAyahs = 0, wordOverflow = 0;
  for (const [key, rec] of entries) {
    const [s, a] = key.split(':').map(Number);
    if (!Number.isFinite(s) || !Number.isFinite(a)) continue;
    const words = (rec.segments ?? [])
      .map(normalizeRow)
      .filter((r) => r && Number.isFinite(r[0]) && Number.isFinite(r[1]) && Number.isFinite(r[2]) && r[2] > r[1]);
    dropped += (rec.segments ?? []).length - words.length;
    if (!words.length) { missingAyahs++; continue; }
    // Word numbering sanity: rows may include the end-marker as one extra word
    const expected = weights[String(s)]?.[a - 1];
    if (expected && Math.max(...words.map((w) => w[0])) > expected + 1) wordOverflow++;
    (bySurah[s] ??= {})[a] = words;
    rows += words.length;
  }

  for (let s = 1; s <= 114; s++) {
    writeFileSync(join(outRoot, dir, `${s}.json`), JSON.stringify(bySurah[s] ?? {}));
  }

  // Sampled audio identity: QUL audio_url vs the everyayah file Takrar plays
  const pad = (n, w) => String(n).padStart(w, '0');
  const sample = entries.filter(() => Math.random() < 0.01).slice(0, VERIFY_SAMPLES);
  let match = 0, mismatch = 0, unchecked = 0;
  for (const [key, rec] of sample) {
    const [s, a] = key.split(':').map(Number);
    const eaUrl = `https://everyayah.com/data/${dir}/${pad(s, 3)}${pad(a, 3)}.mp3`;
    const [qul, ea] = await Promise.all([headLen(rec.audio_url), headLen(eaUrl)]);
    if (qul == null || ea == null) unchecked++;
    else if (qul === ea) match++;
    else { mismatch++; console.log(`  AUDIO MISMATCH ${key}: qul=${qul} everyayah=${ea}`); }
    await sleep(150);
  }

  manifest.reciters[dir] = {
    importedFrom: file,
    ayahsWithSegments: Object.values(bySurah).reduce((n, s) => n + Object.keys(s).length, 0),
    segmentRows: rows,
    malformedRowsDropped: dropped,
    ayahsMissingSegments: missingAyahs,
    ayahsWithWordOverflow: wordOverflow,
    audioIdentitySample: { match, mismatch, unchecked, sampled: sample.length },
  };
  writeFileSync(join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`  rows=${rows} dropped=${dropped} missingAyahs=${missingAyahs} wordOverflow=${wordOverflow} audio: ${match}ok ${mismatch}BAD ${unchecked}?`);
}

console.log('\nDone. Manifest: public/segments/manifest.json');
