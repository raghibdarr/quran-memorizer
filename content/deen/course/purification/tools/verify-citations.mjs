// Re-locates every citation behind Unit Purification in its online copy.
//
//   node content/deen/course/purification/tools/verify-citations.mjs
//
// For each entry in ../citations.json (a primer quote, a consensus citation, or a
// Bidayat al-Mujtahid cross-location) this fetches the recorded page afresh and checks
// that the quote's consonantal skeleton (the same normalisation the deen build uses)
// is on it, reading on into the next page when the quote crosses a page break. It also
// checks that every position quote and consensus location in the lesson files has an
// entry here, and that every Quran ref resolves. Needs network access; it writes nothing.
// A mechanical check only: whether the English says what the Arabic says is the
// checker's job (see ../review.log).

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arabicSkeleton, quranLookup, ROOT } from '../../../../../scripts/build-deen.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const unitDir = join(here, '..');
const { citations } = JSON.parse(readFileSync(join(unitDir, 'citations.json'), 'utf8'));

const pages = new Map();
async function page(url) {
  if (!pages.has(url)) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (citation check)' } });
    const html = await res.text();
    const from = html.indexOf('<div class="nass');
    let to = html.indexOf('<div class="text-center', from);
    if (to < 0) to = html.length;
    const body = from < 0 ? '' : html.slice(from, to).replace(/<p[^>]*class="hamesh"[\s\S]*?<\/p>/g, ' ').replace(/<[^>]+>/g, ' ');
    // The page ends with the site's own "load the next page" control: the book text stops there
    const text = arabicSkeleton(body.replace(/&[a-z#0-9]+;/g, ' '));
    const end = text.indexOf(arabicSkeleton('تحميل الصفحة التالية'));
    pages.set(url, end < 0 ? text : text.slice(0, end).trim());
    await new Promise((r) => setTimeout(r, 300));
  }
  return pages.get(url);
}

let failed = 0;
const fail = (msg) => { failed++; console.error(`FAIL ${msg}`); };

for (const c of citations) {
  const where = `${c.lesson}/${c.claim} ${c.role}${c.school ? ` (${c.school})` : ''}`;
  if (!c.url) { fail(`${where}: no page recorded`); continue; }
  let text = await page(c.url);
  if (c.continuesOn) text += ' ' + (await page(c.continuesOn));
  if (!text.replace(/\s+/g, ' ').includes(arabicSkeleton(c.quote))) fail(`${where}: quote not on ${c.url}: ${c.quote}`);
}

// Every shipped quote and consensus location has a record; every Quran ref resolves
const quran = quranLookup(ROOT);
const key = (c) => `${c.lesson}|${c.claim}|${c.role}|${c.school ?? ''}|${c.work}|${c.location}`;
const have = new Set(citations.map(key));
for (const f of readdirSync(join(unitDir, 'lessons')).filter((n) => n.endsWith('.json'))) {
  const lesson = JSON.parse(readFileSync(join(unitDir, 'lessons', f), 'utf8'));
  for (const claim of lesson.claims) {
    for (const p of claim.positions ?? []) {
      const rec = citations.find((c) => c.lesson === lesson.id && c.claim === claim.id && c.role === 'position' && c.school === p.school);
      if (!rec || rec.quote !== p.quote || rec.work !== p.source.work || rec.location !== p.source.location) fail(`${lesson.id}/${claim.id} ${p.school}: position is not recorded in citations.json as shipped`);
    }
    for (const e of claim.evidence) {
      if (e.consensus && !have.has(`${lesson.id}|${claim.id}|evidence||${e.consensus.work}|${e.consensus.location}`)) fail(`${lesson.id}/${claim.id}: consensus citation ${e.consensus.work} has no record`);
      if (e.quran && !quran.text(e.quran.surahId, e.quran.ayah)) fail(`${lesson.id}/${claim.id}: Quran ${e.quran.surahId}:${e.quran.ayah} does not resolve`);
    }
    if (claim.kind === 'differs' && !citations.some((c) => c.lesson === lesson.id && c.claim === claim.id && c.work === 'bidayat-al-mujtahid')) fail(`${lesson.id}/${claim.id}: difference is not located in Bidayat al-Mujtahid`);
  }
}

console.log(`${citations.length} citations checked against ${pages.size} pages: ${failed ? `${failed} FAILED` : 'all found'}`);
process.exit(failed ? 1 : 0);
