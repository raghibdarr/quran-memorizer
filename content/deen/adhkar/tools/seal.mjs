// Stage C and D helper for the adhkar decks (all-in-one spec 5.4).
//
//   node content/deen/adhkar/tools/seal.mjs [deck] [--write]
//
// For every authored non-Quran item, reads the hadith at the item's first citation in
// both witnesses (the Shamela copy of the printed edition, and hadith-api for
// comparison), and:
//   C  checks our Arabic's skeleton occurs in each witness; with --write it records
//      each witness's ref and the sha256 of the matching skeleton. A witness whose
//      text differs gets the hash of its own reading (found by aligning the words
//      around ours), and the item must carry a provenance.note saying which we chose.
//   D  compares our vowelling word by word with the vocalised witness span and prints
//      every word that differs (final-vowel differences at a pause are listed too;
//      the person running it decides).
// Every other citation is checked the same way (stage G) by `witness.mjs verify`.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arabicSkeleton, skeletonSha256, sha256 } from '../../../../scripts/build-deen.mjs';
import { API, SHAMELA, apiHadith, shamelaHadith, skeletonIn, vocalisedSpan } from './witness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const adhkarDir = join(here, '..');
const args = process.argv.slice(2);
const write = args.includes('--write');
const deckArg = args.find((a) => !a.startsWith('--'));

const EDITION_NAME = {
  bukhari: 'Sahih al-Bukhari, al-Sultaniyya print',
  muslim: 'Sahih Muslim, ed. Muhammad Fu’ad Abd al-Baqi',
  'abu-dawud': 'Sunan Abi Dawud, ed. Muhyi al-Din Abd al-Hamid',
  tirmidhi: 'Sunan al-Tirmidhi, ed. Ahmad Shakir and others',
  'ibn-majah': 'Sunan Ibn Majah, ed. Muhammad Fu’ad Abd al-Baqi',
};

/** The witness's own reading where ours does not occur: the closest window of the same length */
function closestSpan(ours, text) {
  const want = arabicSkeleton(ours).split(' ');
  const hay = arabicSkeleton(text).split(' ');
  let best = { score: -1, at: 0, len: want.length };
  for (const len of [want.length - 1, want.length, want.length + 1, want.length + 2]) {
    for (let i = 0; i + len <= hay.length; i++) {
      const win = hay.slice(i, i + len);
      const set = new Set(win);
      const score = want.filter((w) => set.has(w)).length - Math.abs(len - want.length) * 0.5;
      if (score > best.score) best = { score, at: i, len };
    }
  }
  return hay.slice(best.at, best.at + best.len).join(' ');
}

const strip = (w) => w.replace(/[،؛.,:«»"'()!؟?]/g, '');
const vowelDiffs = (ours, span) => {
  if (!span) return ['(no vocalised span found)'];
  const a = ours.split(/\s+/).map(strip).filter(Boolean);
  const b = span.split(/\s+/).map(strip).filter((w) => arabicSkeleton(w));
  const out = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const na = a[i].normalize('NFC').replace(/ٰ/g, '');
    const nb = b[i].normalize('NFC').replace(/ٰ/g, '').replace(/ى(?=$)/, 'ي');
    if (na !== nb) out.push(`${a[i]} | ${b[i]}`);
  }
  return out;
};

const decks = deckArg ? [deckArg] : readdirSync(adhkarDir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'tools').map((e) => e.name);
let problems = 0;
for (const d of decks) {
  const dir = join(adhkarDir, d, 'items');
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const path = join(dir, f);
    const item = JSON.parse(readFileSync(path, 'utf8'));
    if (item.quran || !item.arabic) continue;
    const c0 = item.citations[0];
    const n = Number(c0.number);
    const ours = skeletonSha256(item.arabic);
    const s = SHAMELA[c0.collection] ? await shamelaHadith(c0.collection, n) : null;
    const a = API[c0.collection] ? await apiHadith(c0.collection, n) : null;
    const rows = [];
    const witnesses = [];
    if (s) {
      const hit = skeletonIn(item.arabic, s.text);
      const sk = hit ?? closestSpan(item.arabic, s.text);
      witnesses.push({ name: 'shamela', ref: `${EDITION_NAME[c0.collection]}, hadith ${n}: ${s.url}`, skeletonSha256: hit ? ours : sha256(sk) });
      rows.push(hit ? '  C shamela: matches' : `  C shamela: DIFFERS, its reading: ${sk}`);
      const vd = vowelDiffs(item.arabic, vocalisedSpan(item.arabic, s.text));
      if (hit && vd.length && c0.collection !== 'muslim') rows.push(`  D vs shamela: ${vd.join(' ; ')}`);
    }
    if (a) {
      const hit = skeletonIn(item.arabic, a.text);
      const sk = hit ?? closestSpan(item.arabic, a.text);
      witnesses.push({ name: 'hadith-api', ref: `fawazahmed0/hadith-api, edition ${API[c0.collection]}, hadith ${n} (comparison only)`, skeletonSha256: hit ? ours : sha256(sk) });
      rows.push(hit ? '  C hadith-api: matches' : `  C hadith-api: DIFFERS, its reading: ${sk}`);
      const vd = vowelDiffs(item.arabic, vocalisedSpan(item.arabic, a.text));
      if (hit && vd.length) rows.push(`  D vs hadith-api: ${vd.join(' ; ')}`);
    }
    const anyMiss = witnesses.some((w) => w.skeletonSha256 !== ours);
    const allMiss = witnesses.every((w) => w.skeletonSha256 !== ours);
    if (allMiss || (anyMiss && !item.provenance?.note)) problems++;
    console.log(`${allMiss ? 'FAIL' : anyMiss ? (item.provenance?.note ? 'VAR ' : 'FAIL') : 'ok  '} ${d}/${item.id} (${c0.collection} ${n})`);
    for (const r of rows) console.log(r);
    if (write && !allMiss) {
      item.provenance = { ...item.provenance, witnesses };
      writeFileSync(path, `${JSON.stringify(item, null, 2)}\n`);
    }
  }
}
console.log(`${problems} problem(s)`);
process.exit(problems ? 1 : 0);
