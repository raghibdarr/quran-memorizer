#!/usr/bin/env node
// Build-time pipeline for the mosque finder (all-in-one spec 4, 6). NEVER called
// from the app: the app only fetches the finished /data/mosques/<CC>.json files.
//
// 1. One Overpass query for every OpenStreetMap feature tagged
//    amenity=place_of_worship + religion=muslim (worldwide, CSV, centre points),
//    sent once with a generic User-Agent. One big query is far gentler on the
//    shared Overpass servers than 250 per-country area queries.
// 2. Each mosque is given a country by point-in-polygon against Natural Earth's
//    1:10m admin-0 countries (public domain, pinned release, sha256 checked).
//    A point just offshore of the generalised coastline takes the country of the
//    nearest mosque within 25 km, or failing that the nearest coast within 100 km
//    (fjord towns, atolls the boundary file doesn't draw).
// 3. One compact pack per country, an index, and SOURCE.md with counts and
//    sha256 per file.
//
// Raw downloads are cached outside the repo (default <os tmp>/takrar-osm-mosques),
// so a rerun or a format change needs no network.
//
// Pack format (v1):
//   { "v": 1, "cc": "GB", "date": "YYYY-MM-DD",
//     "attribution": "Data © OpenStreetMap contributors (ODbL)",
//     "m": [[lat, lng, name?, nameAr?, nameEn?], ...] }
//   lat/lng have 4 decimals (about 11 m); name:ar / name:en are kept only when they
//   differ from name; trailing empty names are dropped, so an unnamed mosque is
//   just [lat, lng]. Rows are sorted by lat then lng.
//
// Usage:
//   node scripts/build-mosques.mjs                     fetch (cached) + build
//   node scripts/build-mosques.mjs --offline           build from the cache only
//   node scripts/build-mosques.mjs --refresh           refetch the OSM data
//   node scripts/build-mosques.mjs --countries GB,US   write only these packs
//   node scripts/build-mosques.mjs --per-country GB,US fallback when the worldwide query can't be had:
//                                                      one area query per named country, spaced out
//   node scripts/build-mosques.mjs --check             verify committed packs, index and SOURCE.md (no network, no writes)
//   --cache <dir>   download cache
//   --budget <MB>   size limit for all packs together (default 8): see pickWithinBudget

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data', 'mosques');
const SOURCE_MD = join(ROOT, 'data-sources', 'osm-mosques', 'SOURCE.md');

export const PACK_VERSION = 1;
export const ATTRIBUTION = 'Data © OpenStreetMap contributors (ODbL)';
const USER_AGENT = 'takrar-build-mosques/1.0 (open-source app data build script)';
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

export const OVERPASS_QUERY =
  '[out:csv(::type,::id,::lat,::lon,name,"name:ar","name:en";true;"\\t")][timeout:900][maxsize:1073741824];' +
  'nwr["amenity"="place_of_worship"]["religion"="muslim"];' +
  'out center qt;';

const NE = {
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson',
  file: 'ne_10m_admin_0_countries.geojson',
  sha256: '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
};

// Natural Earth units with no ISO code, mapped to the code GeoNames (and so the
// app's place picker) uses for towns there
const NE_NO_ISO = { Somaliland: 'SO', 'N. Cyprus': 'CY', Akrotiri: 'CY', Dhekelia: 'CY', 'Cyprus U.N. Buffer Zone': 'CY', 'Siachen Glacier': 'IN' };

// Natural Earth draws France with its overseas departments; GeoNames gives each
// its own code, so a place in Réunion looks for RE, not FR
const FR_OVERSEAS = [
  ['RE', 55.1, -21.5, 56.0, -20.8],
  ['YT', 44.9, -13.1, 45.4, -12.5],
  ['GP', -61.9, 15.8, -60.9, 16.6],
  ['MQ', -61.3, 14.3, -60.7, 15.0],
  ['GF', -54.7, 2.0, -51.5, 6.0],
];

// Where Natural Earth's drawing and GeoNames disagree about the code, the pack
// follows GeoNames, because that is the code the user's place carries: a place in
// Simferopol or Laayoune must find its own town's mosques. This takes no position
// on any border; it only keeps the lists and the place picker in step.
// [code Natural Earth gives, code GeoNames uses, west, south, east, north]
const PLACE_PICKER_CODES = [
  ['RU', 'UA', 32.4, 44.3, 36.6, 46.3], // Crimea (Natural Earth 5.1.2 draws it with Russia)
  ['MA', 'EH', -17.2, 20.7, -8.6, 27.6667], // Western Sahara west of the berm (drawn with Morocco)
  ['AU', 'CC', 96.7, -12.3, 97.0, -11.7], // Cocos (Keeling) Islands
  ['AU', 'CX', 105.5, -10.6, 105.8, -10.3], // Christmas Island
];

// How far from any drawn coast a mosque may be and still take that country
const COAST_KM = 100;

// ---- parsing and formatting (pure) ----

const round4 = (n) => {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
};
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Overpass CSV (header + tab-separated rows) to rows [lat, lng, name, ar, en] (full precision) */
export function parseOverpassCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length || !lines[0].startsWith('@type')) throw new Error('not an Overpass CSV answer');
  const seen = new Set();
  const rows = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    if (cols.length !== 7) {
      skipped++; // a stray tab inside a name: skip the row rather than guess
      continue;
    }
    const [type, id, latS, lngS, name, ar, en] = cols;
    const key = `${type}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lat = Number(latS);
    const lng = Number(lngS);
    if (!latS || !lngS || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      skipped++;
      continue;
    }
    rows.push([lat, lng, clean(name), clean(ar), clean(en)]);
  }
  return { rows, skipped };
}

/** Rows to the pack's compact entries: 4-decimal positions, repeated names dropped, trailing empties trimmed, deduped, sorted */
export function compactRows(rows) {
  const out = [];
  const seen = new Set();
  for (const [latF, lngF, name, ar, en] of rows) {
    const lat = round4(latF);
    const lng = round4(lngF);
    const e = [lat, lng, name, ar === name ? '' : ar, en === name ? '' : en];
    while (e.length > 2 && e[e.length - 1] === '') e.pop();
    // The same mosque mapped twice (a node and its building) lands on one 11 m cell with one name
    const key = `${lat},${lng},${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || String(a[2] ?? '').localeCompare(String(b[2] ?? '')));
  return out;
}

export function packJson(cc, date, entries) {
  // One entry per line keeps diffs readable and costs one byte per row
  const head = `{"v":${PACK_VERSION},"cc":"${cc}","date":"${date}","attribution":${JSON.stringify(ATTRIBUTION)},"m":[`;
  return head + (entries.length ? '\n' + entries.map((e) => JSON.stringify(e)).join(',\n') + '\n' : '') + ']}\n';
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ---- countries (point in polygon) ----

function ringBox(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polygons with ring boxes, from Natural Earth features */
export function loadCountryPolygons(geojson) {
  const polys = [];
  for (const f of geojson.features) {
    const p = f.properties;
    let cc = /^[A-Z]{2}$/.test(p.ISO_A2_EH) ? p.ISO_A2_EH : /^[A-Z]{2}$/.test(p.ISO_A2) ? p.ISO_A2 : NE_NO_ISO[p.NAME];
    if (!cc) continue;
    const g = f.geometry;
    const parts = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const rings of parts) polys.push({ cc, box: ringBox(rings[0]), rings });
  }
  return polys;
}

export function countryAt(polys, lat, lng) {
  for (const p of polys) {
    const [x0, y0, x1, y1] = p.box;
    if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
    if (!inRing(lng, lat, p.rings[0])) continue;
    if (p.rings.slice(1).some((h) => inRing(lng, lat, h))) continue;
    return pickerCode(p.cc, lat, lng);
  }
  return null;
}

/** The code the place picker uses for a point Natural Earth files under `cc` */
export function pickerCode(cc, lat, lng) {
  if (cc === 'FR') {
    const o = FR_OVERSEAS.find(([, a, b, c, d]) => lng >= a && lng <= c && lat >= b && lat <= d);
    if (o) return o[0];
  }
  const o = PLACE_PICKER_CODES.find(([from, , a, b, c, d]) => from === cc && lng >= a && lng <= c && lat >= b && lat <= d);
  return o ? o[1] : cc;
}

/**
 * For a point inside no polygon: the country whose drawn coast or border is
 * nearest, if within maxKm. Distances are on a local flat projection, which is
 * well within a kilometre at this range.
 */
export function nearestCountry(polys, lat, lng, maxKm = COAST_KM) {
  const kmLat = 110.574;
  const kmLng = 111.32 * Math.max(0.01, Math.cos(toRad(lat)));
  const padLat = maxKm / kmLat;
  const padLng = maxKm / kmLng;
  let best = null;
  let bestKm = maxKm;
  for (const p of polys) {
    const [x0, y0, x1, y1] = p.box;
    if (lng < x0 - padLng || lng > x1 + padLng || lat < y0 - padLat || lat > y1 + padLat) continue;
    for (const ring of p.rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = (ring[j][0] - lng) * kmLng;
        const ay = (ring[j][1] - lat) * kmLat;
        const bx = (ring[i][0] - lng) * kmLng;
        const by = (ring[i][1] - lat) * kmLat;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < bestKm) {
          bestKm = d;
          best = p.cc;
        }
      }
    }
  }
  return best ? pickerCode(best, lat, lng) : null;
}

const toRad = (d) => (d * Math.PI) / 180;
function km(aLat, aLng, bLat, bLng) {
  const h = Math.sin(toRad(bLat - aLat) / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(toRad(bLng - aLng) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Gives every row a country. Rows offshore of the generalised coast take their
 * nearest placed neighbour's within 25 km; rows with no such neighbour (a fjord
 * town, an atoll the boundary file doesn't draw) take the nearest drawn coast's
 * within 100 km.
 */
export function assignCountries(rows, polys) {
  const cc = rows.map(([lat, lng]) => countryAt(polys, lat, lng));
  const grid = new Map();
  const cell = (lat, lng) => `${Math.floor(lat * 4)},${Math.floor(lng * 4)}`; // 0.25° cells
  rows.forEach(([lat, lng], i) => {
    if (!cc[i]) return;
    const k = cell(lat, lng);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  let rescued = 0;
  let lost = 0;
  rows.forEach(([lat, lng], i) => {
    if (cc[i]) return;
    let best = null;
    let bestKm = 25;
    const cy = Math.floor(lat * 4);
    const cx = Math.floor(lng * 4);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const j of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
          const d = km(lat, lng, rows[j][0], rows[j][1]);
          if (d < bestKm) {
            bestKm = d;
            best = cc[j];
          }
        }
    if (!best) best = nearestCountry(polys, lat, lng);
    if (best) rescued++;
    else lost++;
    cc[i] = best;
  });
  return { cc, rescued, lost };
}

// ---- budget ----

/**
 * Which packs ship when they don't all fit. Every country is kept whole (a
 * partial list would show a far mosque as the nearest). Packs are added
 * smallest first, so the most countries fit, and the countries left out are
 * the ones with the very largest lists; they're named in SOURCE.md and the
 * report.
 */
export function pickWithinBudget(packs, budget) {
  const sorted = [...packs].sort((a, b) => a.bytes - b.bytes || a.cc.localeCompare(b.cc));
  const keep = [];
  const left = [];
  let total = 0;
  for (const p of sorted) {
    if (total + p.bytes > budget) left.push(p);
    else {
      total += p.bytes;
      keep.push(p);
    }
  }
  return { keep, left, total };
}

// ---- network (build time only) ----

async function download(url, init, label) {
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(1_000_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    console.warn(`  ${label}: ${lastErr}, waiting before another try`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error(`${label}: ${lastErr}`);
}

async function getOsm(cacheDir, { refresh, offline }) {
  const file = join(cacheDir, 'world.tsv');
  const meta = join(cacheDir, 'world.meta.json');
  if (!refresh && existsSync(file) && existsSync(meta)) return { text: readFileSync(file, 'utf8'), ...JSON.parse(readFileSync(meta, 'utf8')) };
  if (offline) throw new Error(`no cached OSM data in ${cacheDir}`);
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`querying ${endpoint} (one worldwide query, a few minutes)`);
      const buf = await download(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: OVERPASS_QUERY }).toString() }, 'overpass');
      const text = buf.toString('utf8');
      if (!text.startsWith('@type')) throw new Error('not CSV: ' + text.slice(0, 200));
      const m = { date: new Date().toISOString().slice(0, 10), endpoint };
      writeFileSync(file, text);
      writeFileSync(meta, JSON.stringify(m));
      return { text, ...m };
    } catch (err) {
      console.warn(`  ${endpoint}: ${err instanceof Error ? err.message : err}`);
    }
  }
  throw new Error('no Overpass endpoint answered');
}

/** Fallback query: one country by its OSM boundary (ISO3166-1 tag), so no point-in-polygon step is needed */
export function countryQuery(cc) {
  if (!/^[A-Z]{2}$/.test(cc)) throw new Error(`bad country code ${cc}`);
  return (
    '[out:csv(::type,::id,::lat,::lon,name,"name:ar","name:en";true;"\\t")][timeout:600];' +
    `area["ISO3166-1"="${cc}"]["admin_level"="2"]->.a;` +
    'nwr["amenity"="place_of_worship"]["religion"="muslim"](area.a);' +
    'out center qt;'
  );
}

/**
 * --per-country: when the shared servers can't answer the worldwide query, ask
 * for the named countries one at a time, with a pause between them. Each answer
 * is cached with its date; a country that fails is reported and left out.
 */
async function getPerCountry(cacheDir, codes, { refresh, offline }) {
  const got = new Map();
  const failed = [];
  let first = true;
  for (const cc of codes) {
    const file = join(cacheDir, `country-${cc}.tsv`);
    const meta = join(cacheDir, `country-${cc}.meta.json`);
    if (!refresh && existsSync(file) && existsSync(meta)) {
      got.set(cc, { text: readFileSync(file, 'utf8'), ...JSON.parse(readFileSync(meta, 'utf8')) });
      continue;
    }
    if (offline) {
      failed.push(cc);
      continue;
    }
    if (!first) await new Promise((r) => setTimeout(r, 15_000)); // one query at a time, politely spaced
    first = false;
    let ok = false;
    for (const endpoint of ENDPOINTS) {
      try {
        console.log(`${cc}: querying ${endpoint}`);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: countryQuery(cc) }).toString(),
          signal: AbortSignal.timeout(700_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text.startsWith('@type')) throw new Error('not CSV: ' + text.slice(0, 120));
        const m = { date: new Date().toISOString().slice(0, 10), endpoint };
        writeFileSync(file, text);
        writeFileSync(meta, JSON.stringify(m));
        got.set(cc, { text, ...m });
        ok = true;
        break;
      } catch (err) {
        console.warn(`  ${cc} ${endpoint}: ${err instanceof Error ? err.message : err}`);
        await new Promise((r) => setTimeout(r, 20_000));
      }
    }
    if (!ok) failed.push(cc);
  }
  return { got, failed };
}

async function getBoundaries(cacheDir, { offline }) {
  const file = join(cacheDir, NE.file);
  if (!existsSync(file)) {
    if (offline) throw new Error(`no cached ${NE.file} in ${cacheDir}`);
    writeFileSync(file, await download(NE.url, {}, 'natural earth'));
  }
  const buf = readFileSync(file);
  if (sha256(buf) !== NE.sha256) throw new Error(`${NE.file}: sha256 mismatch (expected the pinned v5.1.2 file)`);
  return JSON.parse(buf.toString('utf8'));
}

// ---- outputs ----

function writeSourceMd({ date, endpoint, packs, left, stats, perCountry }) {
  const total = packs.reduce((s, p) => s + p.bytes, 0);
  const idx = readFileSync(join(OUT_DIR, 'index.json'));
  const lines = [
    '# OpenStreetMap mosques (country packs)',
    '',
    'Data: OpenStreetMap, https://www.openstreetmap.org, © OpenStreetMap contributors.',
    'Licence: Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/.',
    'The Mosques screen shows "Data © OpenStreetMap contributors (ODbL)", and the app licences',
    'carry data-sources/licenses.d/40-osm.txt.',
    '',
    'The derived files (`public/data/mosques/*.json`, a Derivative Database under the ODbL) and',
    '`scripts/build-mosques.mjs`, which makes them, are public in this repository; anyone may rebuild',
    'or reuse them on the same terms.',
    '',
    '## How the files are made',
    '',
    'At build time only. The app never queries OpenStreetMap or Overpass; it loads one finished',
    'country file and never sends a position anywhere.',
    '',
    ...(perCountry
      ? [
          `1. One Overpass API query per country (${endpoint}), one at a time with a pause between`,
          `   them, retrieved ${date}. The worldwide query (\`${OVERPASS_QUERY}\`) is the`,
          '   first choice; this build used the per-country fallback (`--per-country`) because the',
          '   shared servers could not answer the worldwide one. CC is the ISO 3166-1 alpha-2 code:',
          '',
          '   ```',
          '   ' + countryQuery('CC'),
          '   ```',
          '',
          "2. Each country's file holds what OpenStreetMap maps inside that country's boundary, so no",
          '   separate country step is needed.',
        ]
      : [
          `1. One Overpass API query (${endpoint}), retrieved ${date}:`,
          '',
          '   ```',
          '   ' + OVERPASS_QUERY,
          '   ```',
          '',
          '2. Each mosque is given a country by point-in-polygon against Natural Earth 1:10m admin-0',
          `   countries v5.1.2 (public domain, ${NE.url}, sha256 ${NE.sha256}).`,
          '   The boundaries are used only at build time and are not shipped. A point just offshore of',
          '   the generalised coastline takes the country of the nearest mosque within 25 km, or',
          '   failing that of the nearest drawn coast within 100 km (fjord towns, and atolls the',
          '   boundary file leaves out, as in the Maldives). Codes follow GeoNames, which the place',
          '   picker uses, where the two differ: French overseas departments get their own (RE, YT,',
          '   GP, MQ, GF), Crimea is filed under UA, Western Sahara under EH, and Christmas Island and',
          '   the Cocos Islands under CX and CC. This is only so that a place finds the mosques of its',
          '   own town; it takes no position on any border.',
        ]),
    '',
    '3. Kept per mosque: centre lat/lng rounded to 4 decimals (about 11 m), `name`, and `name:ar` /',
    '   `name:en` when they differ from `name`. Nothing else: no OSM ids, addresses, or opening or',
    '   prayer times.',
    '',
    ...(perCountry
      ? [`OSM features returned: ${stats.rows}. Rows skipped as malformed: ${stats.skipped}.`, ...(stats.failed.length ? [`Countries asked for that did not answer (not shipped): ${stats.failed.join(', ')}.`] : [])]
      : [
          `OSM features returned: ${stats.rows}. Rows skipped as malformed: ${stats.skipped}. Placed offshore`,
          `by nearest neighbour or nearest coast: ${stats.rescued}. With no country (open sea, far islets): ${stats.lost}.`,
        ]),
    '',
    `Packs: ${packs.length} countries, ${packs.reduce((s, p) => s + p.count, 0)} mosques, ${total} bytes (budget 8 MB).`,
    '',
  ];
  if (left.length) {
    lines.push(
      'Left out of this build to stay inside the size budget (largest lists; the script can build',
      'them with a bigger --budget): ' + left.map((l) => `${l.cc} (${l.count} mosques, ${l.bytes} bytes)`).join(', ') + '.',
      '',
    );
  }
  lines.push('## Files', '', '| File | Mosques | Bytes | sha256 |', '|---|---:|---:|---|');
  for (const p of packs) lines.push(`| ${p.cc}.json | ${p.count} | ${p.bytes} | ${p.sha} |`);
  lines.push(`| index.json | | ${idx.length} | ${sha256(idx)} |`, '');
  mkdirSync(dirname(SOURCE_MD), { recursive: true });
  writeFileSync(SOURCE_MD, lines.join('\n'));
}

// ---- --check: committed files agree with each other ----

export function validatePack(json, cc) {
  const errors = [];
  if (json?.v !== PACK_VERSION) errors.push('wrong version');
  if (json?.cc !== cc) errors.push(`cc ${json?.cc} != file ${cc}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(json?.date ?? '')) errors.push('bad date');
  if (json?.attribution !== ATTRIBUTION) errors.push('missing attribution');
  if (!Array.isArray(json?.m)) return [...errors, 'm is not an array'];
  json.m.forEach((e, i) => {
    const ok =
      Array.isArray(e) &&
      e.length >= 2 &&
      e.length <= 5 &&
      typeof e[0] === 'number' &&
      typeof e[1] === 'number' &&
      Math.abs(e[0]) <= 90 &&
      Math.abs(e[1]) <= 180 &&
      e.slice(2).every((s) => typeof s === 'string');
    if (!ok && errors.length < 10) errors.push(`entry ${i} malformed`);
  });
  return errors;
}

function check() {
  const problems = [];
  const idxBuf = readFileSync(join(OUT_DIR, 'index.json'));
  const index = JSON.parse(idxBuf.toString('utf8'));
  const files = readdirSync(OUT_DIR).filter((f) => /^[A-Z]{2}\.json$/.test(f));
  const md = existsSync(SOURCE_MD) ? readFileSync(SOURCE_MD, 'utf8') : '';
  if (!md.includes(sha256(idxBuf))) problems.push('index.json: sha256 not in SOURCE.md');
  let total = 0;
  for (const f of files) {
    const cc = f.slice(0, 2);
    const buf = readFileSync(join(OUT_DIR, f));
    total += buf.length;
    const json = JSON.parse(buf.toString('utf8'));
    for (const e of validatePack(json, cc)) problems.push(`${f}: ${e}`);
    if (json.date !== index.date) problems.push(`${f}: date ${json.date} != index ${index.date}`);
    const row = index.countries?.[cc];
    if (!row) problems.push(`${f}: not in index.json`);
    else {
      if (row.count !== json.m.length) problems.push(`${f}: index count ${row.count} != ${json.m.length}`);
      if (row.bytes !== buf.length) problems.push(`${f}: index bytes ${row.bytes} != ${buf.length}`);
    }
    if (!md.includes(sha256(buf))) problems.push(`${f}: sha256 not in SOURCE.md`);
  }
  for (const cc of Object.keys(index.countries ?? {})) if (!files.includes(`${cc}.json`)) problems.push(`index lists ${cc} with no file`);
  if (total > 8_000_000) problems.push(`packs total ${total} bytes, over the 8 MB budget`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`mosques: ${files.length} packs, ${total} bytes, all consistent`);
}

// ---- main ----

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  if (args.includes('--check')) return check();

  const only = opt('--countries', '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const cacheDir = resolve(opt('--cache', join(tmpdir(), 'takrar-osm-mosques')));
  const budget = Math.round(Number(opt('--budget', '8')) * 1_000_000);
  const offline = args.includes('--offline');
  const refresh = args.includes('--refresh');
  mkdirSync(cacheDir, { recursive: true });

  const perCountryCodes = opt('--per-country', '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const perCountry = perCountryCodes.length > 0;

  const byCc = new Map();
  let osm;
  let stats;
  if (perCountry) {
    const { got, failed } = await getPerCountry(cacheDir, perCountryCodes, { refresh, offline });
    if (!got.size) throw new Error('no country answered');
    let total = 0;
    let skippedAll = 0;
    for (const [code, res] of got) {
      const { rows, skipped } = parseOverpassCsv(res.text);
      total += rows.length;
      skippedAll += skipped;
      if (rows.length) byCc.set(code, rows);
    }
    const dates = [...got.values()].map((r) => r.date).sort();
    // A pack is dated by the oldest answer in the build, so no list claims to be newer than it is
    osm = { date: dates[0], endpoint: [...new Set([...got.values()].map((r) => r.endpoint))].join(', ') };
    stats = { rows: total, skipped: skippedAll, failed };
    console.log(`${total} OSM features from ${got.size} countries (${skippedAll} skipped)` + (failed.length ? `; no answer for ${failed.join(', ')}` : ''));
  } else {
    osm = await getOsm(cacheDir, { refresh, offline });
    const polys = loadCountryPolygons(await getBoundaries(cacheDir, { offline }));
    const { rows, skipped } = parseOverpassCsv(osm.text);
    console.log(`${rows.length} OSM features (${skipped} skipped)`);
    const t0 = Date.now();
    const { cc, rescued, lost } = assignCountries(rows, polys);
    console.log(`countries assigned in ${((Date.now() - t0) / 1000).toFixed(1)} s (${rescued} offshore placed, ${lost} with no country)`);
    rows.forEach((r, i) => {
      if (!cc[i]) return;
      if (!byCc.has(cc[i])) byCc.set(cc[i], []);
      byCc.get(cc[i]).push(r);
    });
    stats = { rows: rows.length, skipped, rescued, lost };
  }
  const all = [...byCc.entries()]
    .filter(([code]) => !only.length || only.includes(code))
    .map(([code, rs]) => {
      const entries = compactRows(rs);
      const json = packJson(code, osm.date, entries);
      return { cc: code, json, count: entries.length, bytes: Buffer.byteLength(json) };
    });
  const { keep, left } = pickWithinBudget(all, budget);

  mkdirSync(OUT_DIR, { recursive: true });
  for (const f of readdirSync(OUT_DIR)) if (/^[A-Z]{2}\.json$/.test(f)) rmSync(join(OUT_DIR, f));
  for (const p of keep) writeFileSync(join(OUT_DIR, `${p.cc}.json`), p.json);

  const packs = keep
    .map((p) => ({ cc: p.cc, count: p.count, bytes: p.bytes, sha: sha256(Buffer.from(p.json)) }))
    .sort((a, b) => a.cc.localeCompare(b.cc));
  const index = { v: PACK_VERSION, date: osm.date, countries: Object.fromEntries(packs.map((p) => [p.cc, { count: p.count, bytes: p.bytes }])) };
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index) + '\n');
  writeSourceMd({ date: osm.date, endpoint: osm.endpoint, packs, left: left.sort((a, b) => b.bytes - a.bytes), stats, perCountry });

  const sum = packs.reduce((s, p) => s + p.bytes, 0);
  console.log(`${packs.length} packs, ${packs.reduce((s, p) => s + p.count, 0)} mosques, ${sum} bytes`);
  if (left.length) console.log('left out (over budget): ' + left.map((l) => `${l.cc} ${l.count}/${l.bytes}B`).join(', '));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
