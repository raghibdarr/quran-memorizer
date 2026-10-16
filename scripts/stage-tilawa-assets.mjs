#!/usr/bin/env node
// Stages the Tilawa trial's assets into a built web root (NOT into git, NOT onto the
// website): the Android CI job runs it on android/app/src/main/assets/public after
// `cap sync`, and local tests run it on out/.
//
//   <dest>/models/tilawa/  zipformer model + phoneme corpus (Quran-Lab NPL-1.2) + licence
//   <dest>/ort/            onnxruntime-web's WASM binary and its loader
//
// Usage: node scripts/stage-tilawa-assets.mjs <dest> [--cache <dir>]
// Downloads from the pinned Tilawa releases and verifies every file's SHA-256.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RELEASES = 'https://github.com/yazinsai/tilawa/releases/download/';
// @tilawa/core 0.4: the a0w model has its own release (which publishes no SHA256SUMS,
// so its hashes are pinned here); the phoneme corpus stays at v0.3.0
const SOURCES = [
  {
    tag: 'zipformer-a0w-ep1-a0.5',
    files: {
      'zipformer_a0w_ep1_a05.int8.onnx': 'bfb5b712695634a6099b45a6a78003bd5103417c4eae6338277d54679254905a',
      'NPL-1.2.txt': '77526bdbfac94132e5114c3a34492c33f915e4b7f310f00b9995500d3610cab5',
    },
  },
  {
    tag: 'v0.3.0',
    files: {
      'zipformer_quran.json': '24360c05ec88fcacf3419c1fe6cd81d69e653326a0bf0e4fb507e7b98fc88127',
      'NOTICE.md': '1e8575bb2b029dc079919513c0937dd8c36150615d6ce529f9c01acf1ec78d9f',
    },
  },
];
const ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];

const dest = process.argv[2];
if (!dest) {
  console.error('usage: node scripts/stage-tilawa-assets.mjs <dest> [--cache <dir>]');
  process.exit(1);
}
const cacheIdx = process.argv.indexOf('--cache');
const cache = cacheIdx > 0 ? process.argv[cacheIdx + 1] : null;

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const modelDir = path.join(dest, 'models', 'tilawa');
fs.mkdirSync(modelDir, { recursive: true });
for (const { tag, files } of SOURCES) {
  for (const [f, want] of Object.entries(files)) {
    const cached = cache && path.join(cache, f);
    const buf = cached && fs.existsSync(cached) ? fs.readFileSync(cached) : await download(`${RELEASES}${tag}/${f}`);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash !== want) throw new Error(`${f}: checksum mismatch (${hash} ≠ ${want})`);
    fs.writeFileSync(path.join(modelDir, f), buf);
    console.log(`staged ${f} (${(buf.length / 1e6).toFixed(1)} MB, sha256 ok)`);
  }
}

const ortDir = path.join(dest, 'ort');
fs.mkdirSync(ortDir, { recursive: true });
for (const f of ORT_FILES) {
  fs.copyFileSync(path.join('node_modules', 'onnxruntime-web', 'dist', f), path.join(ortDir, f));
  console.log(`staged ort/${f}`);
}
