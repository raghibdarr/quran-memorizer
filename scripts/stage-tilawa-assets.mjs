#!/usr/bin/env node
// Stages the Tilawa trial's assets into a built web root (NOT into git, NOT onto the
// website): the Android CI job runs it on android/app/src/main/assets/public after
// `cap sync`, and local tests run it on out/.
//
//   <dest>/models/tilawa/  zipformer model + phoneme corpus (Quran-Lab NPL-1.2) + licence
//   <dest>/ort/            onnxruntime-web's WASM binary and its loader
//
// Usage: node scripts/stage-tilawa-assets.mjs <dest> [--cache <dir>]
// Downloads from the pinned Tilawa release and verifies SHA-256 against its SHA256SUMS.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RELEASE = 'https://github.com/yazinsai/tilawa/releases/download/v0.3.0';
const FILES = ['zipformer_interp_gentle_a05.int8.onnx', 'zipformer_quran.json', 'NPL-1.2.txt', 'NOTICE.md'];
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

const sums = Object.fromEntries(
  (await download(`${RELEASE}/SHA256SUMS`)).toString('utf8').trim().split('\n')
    .map((l) => l.trim().split(/\s+/)).map(([hash, name]) => [name.replace(/^\*/, ''), hash]),
);

const modelDir = path.join(dest, 'models', 'tilawa');
fs.mkdirSync(modelDir, { recursive: true });
for (const f of FILES) {
  const cached = cache && path.join(cache, f);
  const buf = cached && fs.existsSync(cached) ? fs.readFileSync(cached) : await download(`${RELEASE}/${f}`);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (sums[f] && sums[f] !== hash) throw new Error(`${f}: checksum mismatch (${hash} ≠ ${sums[f]})`);
  fs.writeFileSync(path.join(modelDir, f), buf);
  console.log(`staged ${f} (${(buf.length / 1e6).toFixed(1)} MB${sums[f] ? ', sha256 ok' : ''})`);
}

const ortDir = path.join(dest, 'ort');
fs.mkdirSync(ortDir, { recursive: true });
for (const f of ORT_FILES) {
  fs.copyFileSync(path.join('node_modules', 'onnxruntime-web', 'dist', f), path.join(ortDir, f));
  console.log(`staged ort/${f}`);
}
