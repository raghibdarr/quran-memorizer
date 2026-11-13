#!/usr/bin/env node
// Bundle guard for the all-in-one build (spec 3.3, 10). Run after `npm run build`:
//
//   node scripts/check-bundle.mjs                    check out/ against the baseline
//   node scripts/check-bundle.mjs --write-baseline   record out/ as the new baseline
//
// Fails when
//   - any script the root index.html loads contains adhan (the prayer engine must
//     load by dynamic import, so Home's first load is unchanged for people
//     without a place), or
//   - Home's first-load JS grew more than 6 KB gzipped over the baseline, or
//   - out/ grew more than 12 MB over the baseline.
// The baseline (scripts/bundle-baseline.json) was measured on the build before
// the all-in-one work; integration may re-record it once a release ships.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ROOT = flag('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const BASELINE = flag('--baseline') ?? join(ROOT, 'scripts', 'bundle-baseline.json');

export const HOME_GROWTH_LIMIT = 6 * 1024;
export const OUT_GROWTH_LIMIT = 12 * 1024 * 1024;
/** Strings that survive minification and only adhan contains */
export const ADHAN_MARKERS = /AqrabBalad|seasonAdjustedMorningTwilight|nightPortions/;

/** The scripts Home loads before it's interactive: every script src and script preload in index.html */
export function homeScripts(html) {
  const srcs = new Set();
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)) srcs.add(m[1]);
  for (const m of html.matchAll(/<link[^>]*rel="(?:preload|modulepreload)"[^>]*>/g)) {
    const tag = m[0];
    const href = /href="([^"]+\.js)"/.exec(tag)?.[1];
    if (href && (/as="script"/.test(tag) || tag.includes('modulepreload'))) srcs.add(href);
  }
  return [...srcs].filter((s) => s.startsWith('/'));
}

function dirBytes(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return total;
}

export function measure(outDir = OUT) {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const scripts = homeScripts(html);
  let homeGzip = 0;
  const withAdhan = [];
  for (const src of scripts) {
    const file = join(outDir, src);
    if (!existsSync(file)) continue;
    const code = readFileSync(file);
    homeGzip += gzipSync(code, { level: 9 }).length;
    if (ADHAN_MARKERS.test(code.toString('utf8'))) withAdhan.push(src);
  }
  return { homeScripts: scripts.length, homeFirstLoadGzip: homeGzip, outBytes: dirBytes(outDir), withAdhan };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const signed = (n, fmt) => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}`;

function main() {
  if (!existsSync(join(OUT, 'index.html'))) {
    console.error('check-bundle: out/index.html not found. Run npm run build first.');
    return 2;
  }
  const now = measure();
  console.log(`Home first load: ${now.homeScripts} scripts, ${kb(now.homeFirstLoadGzip)} gzipped. out/: ${mb(now.outBytes)}.`);

  if (argv.includes('--write-baseline')) {
    const { withAdhan: _ignored, ...rest } = now;
    void _ignored;
    writeFileSync(BASELINE, JSON.stringify({ ...rest, measuredAt: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
    console.log(`Baseline written to ${BASELINE}`);
    return 0;
  }

  let failed = false;
  if (now.withAdhan.length) {
    console.error(`FAIL adhan is in Home's first-load scripts: ${now.withAdhan.join(', ')}. Load src/lib/prayer/engine with a dynamic import.`);
    failed = true;
  }
  if (existsSync(BASELINE)) {
    const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const homeDelta = now.homeFirstLoadGzip - base.homeFirstLoadGzip;
    const outDelta = now.outBytes - base.outBytes;
    console.log(`Against the baseline (${base.measuredAt}): Home ${signed(homeDelta, kb)} gzipped (limit +${kb(HOME_GROWTH_LIMIT)}), out/ ${signed(outDelta, mb)} (limit +${mb(OUT_GROWTH_LIMIT)}).`);
    if (homeDelta > HOME_GROWTH_LIMIT) { console.error('FAIL Home first-load JS grew past its budget.'); failed = true; }
    if (outDelta > OUT_GROWTH_LIMIT) { console.error('FAIL out/ grew past its budget.'); failed = true; }
  } else {
    console.log('No baseline yet: record one with --write-baseline.');
  }
  if (!failed) console.log('check-bundle: OK');
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
