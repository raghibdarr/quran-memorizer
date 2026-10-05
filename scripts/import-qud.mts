// Imports Qur'anic Universal Audio (QUD, CC BY 4.0) timings for the reciters in
// src/data/qud-reciters.json into public/segments/{id}/{surah}.json.
//
// QUD times every recitation against WHOLE-SURAH mp3s (never per-ayah files), so each
// file also carries where each ayah sits in that surah's recording:
//   { "<ayah>": [[word, startMs, endMs], ...],          // relative to the ayah's start
//     "_audio": { "src": "<surah mp3>", "verses": { "<ayah>": [startMs, endMs] } } }
// The audio controller plays an ayah as that slice of the surah file (src/lib/audio.ts).
// Word numbers go through the same alignment as QUL's (src/lib/align-timings.ts).
//
// Run: node --experimental-strip-types scripts/import-qud.mts [--cache <dir>] [--release v3.2.0]
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import { alignAyah, type Row, type AlignMethod } from '../src/lib/align-timings.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const release = arg('--release') ?? 'v3.2.0';
const cache = arg('--cache') ?? join(root, '.qud-cache');
const BASE = `https://github.com/QUD-Technologies/quranic-universal-audio/releases/download/${release}`;
mkdirSync(cache, { recursive: true });

const reciters: { id: string; slug: string; fallback: string }[] = JSON.parse(readFileSync(join(root, 'src', 'data', 'qud-reciters.json'), 'utf8'));

const ourWords = new Map<string, string[]>();
for (let s = 1; s <= 114; s++) {
  const surah = JSON.parse(readFileSync(join(root, 'src', 'data', `surah-${s}.json`), 'utf8'));
  for (const a of surah.ayahs) ourWords.set(`${s}:${a.number}`, a.words.filter((w: { charType: string }) => w.charType === 'word').map((w: { textUthmani: string }) => w.textUthmani));
}

/** The files in a zip, by name (stored or deflated entries; enough for QUD's release zips) */
function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  const out = new Map<string, Buffer>();
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataAt, dataAt + size);
    out.set(name.split('/').pop()!,method === 8 ? inflateRawSync(data) : Buffer.from(data));
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

async function download(url: string, dest: string) {
  if (existsSync(dest)) return;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/** Follow redirects once at import (mp3quran's server URLs 301 to its CDN) and confirm seeking works there */
async function finalUrl(url: string): Promise<{ url: string; ranged: boolean }> {
  let u = url;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(u, { method: 'GET', headers: { Range: 'bytes=0-1' }, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location')!, u).href; continue; }
    await res.body?.cancel();
    return { url: u, ranged: res.status === 206 };
  }
  throw new Error(`too many redirects: ${url}`);
}

const manifestPath = join(root, 'public', 'segments', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.qud = { source: 'https://github.com/QUD-Technologies/quranic-universal-audio (Qur\'anic Universal Audio, CC BY 4.0)', release, reciters: {} };

for (const r of reciters) {
  const zip = join(cache, `${r.slug}.zip`);
  await download(`${BASE}/${r.slug}.zip`, zip);
  const files = unzip(readFileSync(zip));
  const catalog = JSON.parse(files.get('catalog.json')!.toString('utf8'));
  const rec = Array.isArray(catalog) ? catalog[0] : catalog.recitations?.[0] ?? catalog;
  const chapterUrls: Record<string, string> = rec.audio.chapter_urls;
  if (rec.audio.chapter_offsets_ms && Object.keys(rec.audio.chapter_offsets_ms).length) throw new Error(`${r.slug}: chapter offsets unsupported`);
  const words = JSON.parse(gunzipSync(files.get('word_timestamps.json.gz')!).toString('utf8'));

  const bySurah = new Map<number, Record<string, unknown>>();
  const count: Record<AlignMethod | 'skipped', number> = { exact: 0, split: 0, proportional: 0, short: 0, skipped: 0 };
  // A reciter may repeat an ayah; QUD marks one occurrence canonical, and that's the one we keep
  const seen = new Set<string>();
  for (const [ref, start, end, canonical, , ws] of words.rows as [string, number, number, boolean, number, Row[]][]) {
    const m = /^(\d+):(\d+)$/.exec(ref);
    const ours = m && ourWords.get(ref);
    if (!m || !ours || canonical === false || seen.has(ref)) { count.skipped++; continue; }
    seen.add(ref);
    const s = Number(m[1]), a = m[2];
    const rel: Row[] = ws.map(([w, ws0, we0]) => [w, Math.max(0, ws0 - start), Math.max(0, we0 - start)] as Row).sort((x, y) => x[1] - y[1]);
    const out = alignAyah(ours, rel);
    count[out.method]++;
    let file = bySurah.get(s);
    if (!file) { file = { _audio: { src: chapterUrls[String(s)], verses: {} } }; bySurah.set(s, file); }
    file[a] = out.rows;
    (file._audio as { verses: Record<string, [number, number]> }).verses[a] = [start, end];
  }

  // Resolve every surah's final URL (and check range support) a few at a time
  const surahs = [...bySurah.keys()];
  let unranged = 0;
  for (let i = 0; i < surahs.length; i += 8) {
    await Promise.all(surahs.slice(i, i + 8).map(async (s) => {
      const audio = bySurah.get(s)!._audio as { src: string };
      const f = await finalUrl(audio.src);
      audio.src = f.url;
      if (!f.ranged) unranged++;
    }));
  }

  const outDir = join(root, 'public', 'segments', r.id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [s, file] of bySurah) writeFileSync(join(outDir, `${s}.json`), JSON.stringify(file));
  manifest.qud.reciters[r.id] = { slug: r.slug, name: rec.name_en, surahs: bySurah.size, ...count, unrangedSurahs: unranged, missingVerses: rec.coverage?.missing_verses ?? null };
  console.log(`${r.id} <- ${r.slug}: ${bySurah.size} surahs ${JSON.stringify(count)} unranged=${unranged} missing=${rec.coverage?.missing_verses ?? '-'}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
