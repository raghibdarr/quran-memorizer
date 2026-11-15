#!/usr/bin/env node
// Post-build: the offline app shell for the web PWA (public/sw.js precaches it
// at install). Writes out/precache.json with, for the tab and tool routes, the
// page HTML, its router payloads (route .txt and the per-segment __next.*.txt)
// and every /_next/static file that HTML references; and stamps out/sw.js with
// a version from that list, so each deploy installs a fresh worker that caches
// the new shell. Content chunks loaded later (decks, surah text) are cached as
// they are used, as before. Native shells don't use the worker (bundle on device).
// Idempotent; runs as `postbuild` after flatten-segments.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
if (!fs.existsSync(out)) {
  console.log('build-precache: no out/ directory — skipped');
  process.exit(0);
}

/** Routes that must open with no signal: the five tabs, the Prayer tools, the learning screens */
export const ROUTES = [
  '/', '/review', '/review/deen', '/prayer', '/essentials', '/progress',
  '/prayer/setup', '/prayer/settings', '/prayer/why', '/prayer/match', '/prayer/alerts', '/prayer/tracker',
  '/qibla', '/tasbih', '/calendar', '/ramadan', '/zakat', '/mosques',
  '/hadith', '/hadith/view', '/adhkar', '/adhkar/view', '/adhkar/now', '/names',
  '/course', '/course/lesson', '/glossary', '/sources', '/learn', '/plan', '/plans',
];

const rel = (p) => '/' + path.relative(out, p).split(path.sep).join('/');
const pages = [];
const assets = new Set();
const missing = [];

for (const route of ROUTES) {
  const html = route === '/' ? path.join(out, 'index.html') : path.join(out, `${route.slice(1)}.html`);
  if (!fs.existsSync(html)) {
    missing.push(route);
    continue;
  }
  pages.push(route);
  const payload = route === '/' ? path.join(out, 'index.txt') : path.join(out, `${route.slice(1)}.txt`);
  if (fs.existsSync(payload)) pages.push(rel(payload));
  // The per-segment payloads the client router asks for on a soft navigation
  const dir = route === '/' ? out : path.join(out, route.slice(1));
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const f of fs.readdirSync(dir)) if (f.startsWith('__next.') && f.endsWith('.txt')) pages.push(rel(path.join(dir, f)));
  }
  const text = fs.readFileSync(html, 'utf8');
  for (const m of text.matchAll(/\/_next\/static\/[^"'\s)]+?\.(?:js|css|woff2)/g)) {
    if (fs.existsSync(path.join(out, m[0]))) assets.add(m[0]);
  }
}

const list = { pages: [...new Set(pages)], assets: [...assets].sort() };
const version = crypto.createHash('sha256').update(JSON.stringify(list)).digest('hex').slice(0, 12);
fs.writeFileSync(path.join(out, 'precache.json'), JSON.stringify({ version, ...list }) + '\n');

const sw = path.join(out, 'sw.js');
if (fs.existsSync(sw)) {
  const src = fs.readFileSync(sw, 'utf8');
  fs.writeFileSync(sw, src.replace(/const PRECACHE_VERSION = '[^']*';/, `const PRECACHE_VERSION = '${version}';`));
}

let bytes = 0;
for (const a of list.assets) bytes += fs.statSync(path.join(out, a)).size;
console.log(`build-precache: ${list.pages.length} page files, ${list.assets.length} assets (${(bytes / 1024).toFixed(0)} KB), version ${version}`);
if (missing.length) console.log(`build-precache: not in out/, skipped: ${missing.join(', ')}`);
