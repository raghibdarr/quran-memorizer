#!/usr/bin/env node
// Mushaf prototype (branch mushaf/prototype): stage DigitalKhatt's 1441H Madina
// page text, font and the stock HarfBuzz WASM shaper into public/mushaf-dk/.
//
//   node scripts/build-mushaf-dk.mjs <digitalkhatt-madina sources dir>
//
// The sources dir (kept outside the repo) holds:
//   digitalkhatt-js/          git clone of github.com/DigitalKhatt/digitalkhatt-js (MIT)
//   npm/package/              harfbuzzjs 0.4.5 from npm (MIT), `npm pack harfbuzzjs@0.4.5`
// Files are copied unchanged except the page text, which is read from the
// TypeScript source (a plain array of string literals, parsed line by line, never
// evaluated) and written as JSON: 604 pages, each a list of its lines.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('usage: node scripts/build-mushaf-dk.mjs <digitalkhatt-madina sources dir>');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'mushaf-dk');
fs.mkdirSync(out, { recursive: true });

const site = path.join(src, 'digitalkhatt-js', 'apps', 'site-angular', 'src');
const copies = [
  [path.join(site, 'assets', 'fonts', 'hb', 'madina.otf'), 'madina.otf'],
  [path.join(src, 'npm', 'package', 'hb.wasm'), 'hb.wasm'],
  [path.join(src, 'npm', 'package', 'hb.js'), 'hb.js'],
];
for (const [from, to] of copies) {
  fs.copyFileSync(from, path.join(out, to));
  console.log(`build-mushaf-dk: ${to} (${(fs.statSync(from).size / 1024).toFixed(0)} KB)`);
}

const ts = fs.readFileSync(path.join(site, 'app', 'services', 'quran_text_madina.ts'), 'utf8');
const pages = [];
let page = null;
for (const raw of ts.split(/\r?\n/)) {
  const line = raw.trim();
  if (line === '[') page = [];
  else if (line === '],') { pages.push(page); page = null; }
  else if (page) {
    const m = /^'([^'\\]*)',?$/.exec(line);
    if (!m) throw new Error(`unexpected line in page ${pages.length + 1}: ${line.slice(0, 40)}`);
    page.push(m[1]);
  }
}
if (pages.length !== 604) throw new Error(`expected 604 pages, got ${pages.length}`);
const bad = pages.findIndex((p, i) => p.length > 15 || (i > 1 && p.length !== 15));
if (bad >= 0) throw new Error(`page ${bad + 1} has ${pages[bad].length} lines`);
fs.writeFileSync(path.join(out, 'text.json'), JSON.stringify(pages));
console.log(`build-mushaf-dk: text.json, ${pages.length} pages (${(fs.statSync(path.join(out, 'text.json')).size / 1024).toFixed(0)} KB)`);
