#!/usr/bin/env node
// Builds public/data/cities.json from GeoNames cities15000 (CC BY 4.0) for the
// prayer-times city search, the nearest-city label after a GPS fix, and the
// regional default method (all-in-one spec 4). Nothing else is kept: name,
// country, latitude, longitude (2 decimal places, the same rounding as the
// place store) and IANA zone, most populous first.
//
//   node scripts/build-cities.mjs [--src <cities15000.zip|.txt>]   write the file
//   node scripts/build-cities.mjs --check [--src ...]              compare, don't write
//
// The download is kept outside the repo (it changes daily upstream, so the
// archived copy is the pin): Downloads/takrar-sources/geonames/cities15000.zip.
// Its URL, retrieval date and sha256 are in data-sources/geonames/SOURCE.md.
//
// Output (columnar, so the file gzips small; decoded by src/lib/prayer/cities.ts):
//   { v, source, licence, retrieved,
//     countries: [CC...], counts: [rows per country, in that order],
//     zones: [tz...], name: [...],
//     lat, lng: [lat*100 or lng*100, each as the difference from the row before],
//     z: [zoneIdx...], pop: "0-9 population tier per row",
//     ascii: { "<row>": "ascii name" },
//     admin1: { "US": "two-letter state code per US row, concatenated" } }
// Rows are grouped by country, south to north within each.
// `ascii` holds GeoNames' ASCII name only where it can't be got by stripping
// accents from `name` (so search finds "Sultanah" for "Sulţānah" either way).
// `admin1` is kept only for the United States, whose GeoNames admin1 codes are
// the two-letter state codes: search results show the state ("Springfield,
// Missouri"), since many US towns share a name. The state names are our own
// table in src/lib/prayer/cities.ts.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, inflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'cities.json');
const SOURCE_MD = join(ROOT, 'data-sources', 'geonames', 'SOURCE.md');
const GZIP_BUDGET = 350 * 1024;

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const srcFlag = argv.indexOf('--src');
const DEFAULT_SRC = [
  join(ROOT, 'data-sources', 'geonames', 'cities15000.zip'),
  join(homedir(), 'Downloads', 'takrar-sources', 'geonames', 'cities15000.zip'),
];
const src = srcFlag >= 0 ? argv[srcFlag + 1] : DEFAULT_SRC.find((p) => existsSync(p));
if (!src || !existsSync(src)) {
  console.error(`cities15000 not found. Download https://download.geonames.org/export/dump/cities15000.zip\nand pass --src <path> (looked in: ${DEFAULT_SRC.join(', ')})`);
  process.exit(1);
}

/** The first file in a zip, via its central directory (no dependency needed) */
function unzipFirst(buf) {
  // End of central directory: signature 0x06054b50, within the last 64 KB
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('bad central directory');
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOffset = buf.readUInt32LE(cdOffset + 42);
  if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('bad local header');
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`unsupported zip compression ${method}`);
}

/** Lower case, accents and apostrophe variants removed: the same fold the app's search uses */
export function fold(s) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[‘’ʻʼ`´]/g, "'")
    .toLowerCase();
}

const raw = readFileSync(src);
const sha256 = createHash('sha256').update(raw).digest('hex');
const text = (src.endsWith('.zip') ? unzipFirst(raw) : raw).toString('utf8');

const rows = [];
for (const line of text.split('\n')) {
  if (!line.trim()) continue;
  const f = line.split('\t');
  // geonameid, name, asciiname, alternatenames, latitude, longitude, feature class,
  // feature code, country code, cc2, admin1..4, population, elevation, dem, timezone, modified
  const [, name, ascii, , lat, lng, , , cc, , admin1, , , , pop, , , tz] = f;
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!name || !tz || !/^[A-Z]{2}$/.test(cc ?? '') || !Number.isFinite(latN) || !Number.isFinite(lngN)) continue;
  rows.push({ name: name.trim(), ascii: (ascii ?? '').trim(), lat: latN, lng: lngN, cc, tz: tz.trim(), pop: Number(pop) || 0, admin1: (admin1 ?? '').trim() });
}

const round100 = (n) => {
  const r = Math.round(n * 100);
  return Object.is(r, -0) ? 0 : r;
};
// Grouped by country, then south to north: neighbouring rows share a zone and a
// latitude, so the deltas below stay small and the file gzips well
rows.sort((a, b) => (a.cc < b.cc ? -1 : a.cc > b.cc ? 1 : 0) || round100(a.lat) - round100(b.lat) || round100(a.lng) - round100(b.lng) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const countries = [...new Set(rows.map((r) => r.cc))];
const counts = countries.map((c) => rows.filter((r) => r.cc === c).length);
const zones = [...new Set(rows.map((r) => r.tz))].sort();
const zIdx = new Map(zones.map((z, i) => [z, i]));
/** Each value minus the one before it (the first is itself) */
const deltas = (values) => values.map((v, i) => (i === 0 ? v : v - values[i - 1]));
/** Population tier 0-9: 0 = under 30,000, each step doubles; search ranks ties by it */
const tier = (pop) => Math.max(0, Math.min(9, Math.floor(Math.log2(Math.max(pop, 1) / 15_000))));

const retrieved = (() => {
  if (!existsSync(SOURCE_MD)) return 'unknown';
  return /Retrieved:\s*(\d{4}-\d{2}-\d{2})/.exec(readFileSync(SOURCE_MD, 'utf8'))?.[1] ?? 'unknown';
})();

const ascii = {};
rows.forEach((r, i) => {
  if (r.ascii && fold(r.ascii) !== fold(r.name)) ascii[i] = r.ascii;
});

/** Countries whose admin1 codes ship (two letters each, in row order) */
const ADMIN1_COUNTRIES = ['US'];
const admin1 = {};
for (const cc of ADMIN1_COUNTRIES) {
  const codes = rows.filter((r) => r.cc === cc).map((r) => r.admin1);
  const bad = codes.find((c) => !/^[A-Z]{2}$/.test(c));
  if (bad !== undefined) {
    console.error(`${cc}: admin1 code ${JSON.stringify(bad)} is not two letters`);
    process.exit(1);
  }
  if (codes.length) admin1[cc] = codes.join('');
}

const out = {
  v: 1,
  source: 'GeoNames cities15000 (https://www.geonames.org)',
  licence: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
  retrieved,
  countries,
  counts,
  zones,
  name: rows.map((r) => r.name),
  lat: deltas(rows.map((r) => round100(r.lat))),
  lng: deltas(rows.map((r) => round100(r.lng))),
  z: rows.map((r) => zIdx.get(r.tz)),
  pop: rows.map((r) => tier(r.pop)).join(''),
  ascii,
  admin1,
};

const json = JSON.stringify(out);
const gz = gzipSync(json, { level: 9 }).length;
console.log(`source ${src}\n  sha256 ${sha256}\n${rows.length} places, ${countries.length} countries, ${zones.length} zones`);
console.log(`cities.json ${(json.length / 1024).toFixed(0)} KB, ${(gz / 1024).toFixed(0)} KB gzipped (budget ${GZIP_BUDGET / 1024} KB)`);
if (gz > GZIP_BUDGET) {
  console.error('Over the gzip budget.');
  process.exit(1);
}

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== json) {
    console.error('public/data/cities.json is out of date: run node scripts/build-cities.mjs');
    process.exit(1);
  }
  console.log('cities.json is up to date.');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT}`);
}
