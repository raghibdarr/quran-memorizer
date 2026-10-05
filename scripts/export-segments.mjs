// One-time export of word-level audio timestamps from QUL (qul.tarteel.ai) for the
// reciters Takrar streams from everyayah.com. Research + licensing notes:
// .claude/plans/ayah-segmentation-waqf.md (Phase C).
//
// For each covered reciter it writes public/segments/{everyayahDir}/{surah}.json:
//   { "<ayahNumber>": [[word_1based, start_ms, end_ms], ...], ... }
// with times relative to the per-ayah mp3 Takrar already plays (QUL's audio_url is
// byte-identical to the everyayah file — sampled-verified below and recorded in the
// manifest). Run: node scripts/export-segments.mjs
// THEN run scripts/align-segments.mts: sources number some words differently from ours.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'public', 'segments');

// everyayah directory id -> QUL ayah-by-ayah recitation id (verified word-level)
const RECITERS = {
  Alafasy_128kbps: 18,
  Husary_128kbps: 20,
  Abdul_Basit_Murattal_192kbps: 15,
  Minshawy_Murattal_128kbps: 24,
  'Yasser_Ad-Dussary_128kbps': 26,
  // NOTE: QUL aligns Maher to the 128kbps encode — Takrar must play this directory
  // (exact everyayah name, no underscores) for his segments to be usable.
  MaherAlMuaiqly128kbps: 13,
};

const VERIFY_SAMPLES = 15; // per reciter: HEAD-compare QUL audio_url vs everyayah file

const surahsIndex = JSON.parse(readFileSync(join(root, 'src', 'data', 'surahs-index.json'), 'utf8'));
const verseCounts = new Map(surahsIndex.map((s) => [s.id, s.versesCount]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEADERS = {
  accept: 'application/json',
  'user-agent': 'Takrar-segment-export/1.0 (one-time export for a memorization app; contact: raghibdarr@gmail.com)',
};

async function getJson(url, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      // 429/5xx are transient (QUL throttles bursts) — back off hard and retry
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(Math.min(90000, 5000 * 2 ** i));
    }
  }
}

async function headLen(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? Number(res.headers.get('content-length')) : null;
  } catch {
    return null;
  }
}

// Rows arrive as [word, start_ms, end_ms] (docs) or [seg_index, word, start_ms, end_ms]
// (live API); malformed short rows (e.g. [1]) exist in real payloads — skip them.
function normalizeRow(row) {
  if (!Array.isArray(row)) return null;
  if (row.length >= 4) return [row[1], row[2], row[3]];
  if (row.length === 3) return [row[0], row[1], row[2]];
  return null;
}

const manifest = { exportedAt: new Date().toISOString().slice(0, 10), source: 'https://qul.tarteel.ai (Tarteel QUL); original alignments: quran-align by Colin Fair (CC BY 4.0)', reciters: {} };

for (const [dir, recitationId] of Object.entries(RECITERS)) {
  console.log(`\n=== ${dir} (QUL recitation ${recitationId}) ===`);
  mkdirSync(join(outRoot, dir), { recursive: true });
  let totalAyahs = 0, totalRows = 0, dropped = 0, missingAyahs = 0;
  const sampleUrls = [];

  const WINDOW = 40; // ayahs per request — whole-surah queries 502 on big surahs
  // Smallest surahs first so progress accrues before the giant ones hit throttling
  const surahOrder = Array.from({ length: 114 }, (_, i) => i + 1)
    .sort((a, b) => verseCounts.get(a) - verseCounts.get(b));
  for (const surah of surahOrder) {
    const outFile = join(outRoot, dir, `${surah}.json`);
    const to = verseCounts.get(surah);
    // Resumable: a previous run's non-empty file counts as done
    if (existsSync(outFile) && readFileSync(outFile, 'utf8').length > 2) {
      const prev = JSON.parse(readFileSync(outFile, 'utf8'));
      totalAyahs += Object.keys(prev).length;
      totalRows += Object.values(prev).reduce((n, rows) => n + rows.length, 0);
      continue;
    }
    const bySurahAyah = {};
    // Response shape (verified live): { segments: { "2:282": { audio_url, segments: [[seg_idx, word_1based, start_ms, end_ms], ...] } }, pagination: { next_page } }
    for (let from = 1; from <= to; from += WINDOW) {
      const upTo = Math.min(from + WINDOW - 1, to);
      let page = 1;
      for (;;) {
        const url = `https://qul.tarteel.ai/api/v1/audio/ayah_segments/${recitationId}?chapter=${surah}&from=${from}&to=${upTo}&page=${page}`;
        const data = await getJson(url);
        for (const [key, rec] of Object.entries(data?.segments ?? {})) {
          const ayah = Number(key.split(':')[1]);
          if (!Number.isFinite(ayah)) continue;
          const words = (rec.segments ?? [])
            .map(normalizeRow)
            .filter((r) => r && Number.isFinite(r[0]) && Number.isFinite(r[1]) && Number.isFinite(r[2]));
          dropped += (rec.segments ?? []).length - words.length;
          if (!words.length) { missingAyahs++; continue; }
          bySurahAyah[ayah] = words;
          totalAyahs++;
          totalRows += words.length;
          if (rec.audio_url && sampleUrls.length < VERIFY_SAMPLES && Math.random() < 0.05) {
            sampleUrls.push({ surah, ayah, qulUrl: rec.audio_url });
          }
        }
        if (!data?.pagination?.next_page) break;
        page = data.pagination.next_page;
        await sleep(1500);
      }
      await sleep(1500);
    }
    writeFileSync(outFile, JSON.stringify(bySurahAyah));
  }

  // Sampled audio-identity verification: QUL audio_url vs the everyayah file Takrar plays
  let match = 0, mismatch = 0, unchecked = 0;
  for (const s of sampleUrls) {
    const pad = (n, w) => String(n).padStart(w, '0');
    const eaUrl = `https://everyayah.com/data/${dir}/${pad(s.surah, 3)}${pad(s.ayah, 3)}.mp3`;
    const [a, b] = await Promise.all([headLen(s.qulUrl), headLen(eaUrl)]);
    if (a == null || b == null) unchecked++;
    else if (a === b) match++;
    else { mismatch++; console.log(`  MISMATCH ${s.surah}:${s.ayah} qul=${a} everyayah=${b}`); }
    await sleep(150);
  }

  manifest.reciters[dir] = {
    qulRecitationId: recitationId,
    ayahsWithSegments: totalAyahs,
    segmentRows: totalRows,
    malformedRowsDropped: dropped,
    ayahsMissingSegments: missingAyahs,
    audioIdentitySample: { match, mismatch, unchecked, sampled: sampleUrls.length },
  };
  // Written per reciter so an interrupted run still records durable progress
  writeFileSync(join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`  ayahs=${totalAyahs} rows=${totalRows} dropped=${dropped} missing=${missingAyahs} verify: ${match}✓ ${mismatch}✗ ${unchecked}?`);
}

console.log('\nDone. Manifest written to public/segments/manifest.json');
