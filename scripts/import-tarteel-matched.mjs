// Word timings for three EveryAyah reciters whose only open timings were made for Tarteel's
// copies of the same recordings: Qur'anic Universal Audio v3.2.0 (CC BY 4.0), archived in
// Downloads/takrar-sources/qud-v3.2.0 (see its README for why it lives there).
//
// For each surah, Tarteel's whole-surah file is downloaded once to a local cache, and each of
// EveryAyah's per-ayah files is located inside it by cross-correlating their loudness
// envelopes (10 ms steps). The ayah's word timings then move from "inside Tarteel's surah
// file" to "inside EveryAyah's ayah file". Nothing of Tarteel's is shipped or streamed:
// the app keeps playing EveryAyah's files. Ayahs that don't match cleanly (r < 0.9) are left
// without timings rather than guessed.
//
// Needs ffmpeg on PATH. Usage:
//   node scripts/import-tarteel-matched.mjs <qud-v3.2.0 folder> [--cache <dir>] [--only <everyayah dir>] [--window <ms>]
// THEN run: node --experimental-strip-types scripts/align-segments.mts
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'public', 'segments');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const srcDir = process.argv[2];
if (!srcDir || !existsSync(srcDir)) {
  console.error('Usage: node scripts/import-tarteel-matched.mjs <qud-v3.2.0 folder> [--cache <dir>] [--only <dir>]');
  process.exit(1);
}
const cache = arg('--cache') ?? join(tmpdir(), 'takrar-tarteel-match');
const only = arg('--only');
// EveryAyah's Mujawwad files can carry long lead-ins and repeated phrases, so search well around QUD's start
const windowMs = Number(arg('--window') ?? 15000);

/** archived QUD id → the EveryAyah directory Takrar plays */
const RECITERS = {
  'qud-saad_al_ghamdi': 'Ghamadi_40kbps',
  'qud-husary_mujawwad': 'Husary_128kbps_Mujawwad',
  'qud-khalifa_al_tunaiji': 'khalefa_al_tunaiji_64kbps',
};
const MIN_R = 0.9;
const STEP = 80; // samples per envelope step at 8 kHz = 10 ms

const pad3 = (n) => String(n).padStart(3, '0');

async function download(url, dest) {
  if (existsSync(dest)) return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Takrar timing import (https://takrar.pro)' } });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return true;
    } catch (e) {
      if (attempt === 2) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

/** Loudness envelope (RMS per 10 ms) of an mp3, decoded to 8 kHz mono */
function envelope(file) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-v', 'quiet', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 1 << 30 }, (err, buf) => {
      if (err) return reject(err);
      const n = Math.floor(buf.length / 2 / STEP), out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < STEP; j++) { const v = buf.readInt16LE((i * STEP + j) * 2) / 32768; s += v * v; }
        out[i] = Math.sqrt(s / STEP);
      }
      resolve(out);
    });
  });
}

/** Where the ayah file starts inside the surah file (ms, may be negative), searched around `startMs` */
function locate(surahEnv, ayahEnv, startMs, spanMs, windowMs) {
  const s0 = Math.round(startMs / 10), W = Math.round(windowMs / 10);
  const minOverlap = Math.min(ayahEnv.length, spanMs / 10) * 0.6;
  let best = -1, bestP = 0;
  for (let p = s0 - W; p <= s0 + W; p++) {
    let v = 0, na = 0, nb = 0, n = 0;
    for (let i = Math.max(0, -p); i < ayahEnv.length; i++) {
      const y = surahEnv[p + i];
      if (y === undefined) break;
      const x = ayahEnv[i];
      v += x * y; na += x * x; nb += y * y; n++;
    }
    if (n < minOverlap) continue;
    const r = v / Math.sqrt(na * nb || 1);
    if (r > best) { best = r; bestP = p; }
  }
  return { offsetMs: bestP * 10, r: best };
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }));
  return results;
}

const manifestPath = join(outRoot, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

for (const [qudId, eaDir] of Object.entries(RECITERS)) {
  if (only && only !== eaDir) continue;
  const work = join(cache, eaDir);
  mkdirSync(work, { recursive: true });
  const outDir = join(outRoot, eaDir);
  mkdirSync(outDir, { recursive: true });
  let timed = 0, weak = [], absent = [], sumR = 0;

  for (let s = 1; s <= 114; s++) {
    const path = join(srcDir, qudId, `${s}.json`);
    if (!existsSync(path)) continue;
    const old = JSON.parse(readFileSync(path, 'utf8'));
    const surahFile = join(work, `t${pad3(s)}.mp3`);
    await download(old._audio.src, surahFile);
    const surahEnv = await envelope(surahFile);

    const ayahs = Object.entries(old._audio.verses).map(([a, [start, end]]) => ({ a: Number(a), start, end }));
    const found = await pool(ayahs, 8, async ({ a, start, end }) => {
      const file = join(work, `${pad3(s)}${pad3(a)}.mp3`);
      if (!(await download(`https://everyayah.com/data/${eaDir}/${pad3(s)}${pad3(a)}.mp3`, file))) return { a, missing: true };
      const env = await envelope(file);
      const hit = locate(surahEnv, env, start, end - start, windowMs);
      return { a, start, ...hit, lengthMs: env.length * 10 };
    });

    const out = {};
    for (const f of found) {
      if (f.missing) { absent.push(`${s}:${f.a}`); continue; }
      if (f.r < MIN_R) { weak.push(`${s}:${f.a}(${f.r.toFixed(2)})`); continue; }
      const shift = f.start - f.offsetMs; // ayah-file time = verse-relative time + shift
      out[f.a] = old[String(f.a)].map(([w, a0, b0]) => [w, Math.max(0, Math.min(f.lengthMs, a0 + shift)), Math.max(0, Math.min(f.lengthMs, b0 + shift))]);
      timed++; sumR += f.r;
    }
    writeFileSync(join(outDir, `${s}.json`), JSON.stringify(out));
    process.stdout.write(`\r${eaDir}: surah ${s}/114, ${timed} ayahs timed, ${weak.length} weak`);
  }
  console.log(`\n${eaDir}: ${timed} ayahs (mean r ${(sumR / Math.max(1, timed)).toFixed(3)}); weak: ${weak.join(' ') || '-'}; not on EveryAyah: ${absent.join(' ') || '-'}`);
  manifest.reciters ??= {};
  manifest.reciters[eaDir] = {
    importedFrom: `Qur'anic Universal Audio v3.2.0 (CC BY 4.0) timings for ${qudId.replace('qud-', '')}, mapped from Tarteel's copy onto EveryAyah's per-ayah files by envelope cross-correlation (scripts/import-tarteel-matched.mjs)`,
    ayahsWithSegments: timed, lowCorrelationSkipped: weak, notOnEveryAyah: absent, minCorrelation: MIN_R,
    at: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
