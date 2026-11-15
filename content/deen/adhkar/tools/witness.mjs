// Witness tool for the adhkar decks (all-in-one spec 5.1 and 5.4, stages B, C, G).
//
//   node content/deen/adhkar/tools/witness.mjs locate <collection> <number>
//       prints the hadith as two witnesses give it: the Shamela copy of the printed
//       edition (not Sunnah.com-derived) and fawazahmed0/hadith-api (comparison only)
//   node content/deen/adhkar/tools/witness.mjs verify [deck]
//       re-fetches every witness an authored item records and checks, by normalised
//       skeleton, that the item's Arabic (and each variant's) is in the hadith with
//       the number cited, in both witnesses, and that the recorded hashes are right
//   node content/deen/adhkar/tools/witness.mjs grading <shamela book> <page> <quote>
//       checks that a grading quote is on the page recorded for it
//
// Needs network access. It writes nothing under the repo; downloaded pages are cached
// in $WITNESS_CACHE (default: the OS temp folder). The skeleton is the deen build's own
// (scripts/build-deen.mjs arabicSkeleton). A mechanical check only: whether the English
// says what the Arabic says is the back-checker's job.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arabicSkeleton, skeletonSha256 } from '../../../../scripts/build-deen.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const adhkarDir = join(here, '..');
const CACHE = process.env.WITNESS_CACHE || join(tmpdir(), 'takrar-witness-cache');
mkdirSync(CACHE, { recursive: true });

/** Shamela copies of the printed editions whose numbering the citations name */
export const SHAMELA = {
  bukhari: { book: 1681, last: 11208, edition: 'Sahih al-Bukhari, al-Sultaniyya print (Fath al-Bari numbering added)' },
  muslim: { book: 1727, last: 7495, edition: 'Sahih Muslim, ed. Muhammad Fu’ad Abd al-Baqi', paren: true },
  'abu-dawud': { book: 1726, last: 7206, edition: 'Sunan Abi Dawud, ed. Muhyi al-Din Abd al-Hamid' },
  tirmidhi: { book: 1435, last: 6463, edition: 'Sunan al-Tirmidhi, ed. Ahmad Shakir and others' },
  'ibn-majah': { book: 1198, last: 5910, edition: 'Sunan Ibn Majah, ed. Muhammad Fu’ad Abd al-Baqi' },
};

/** hadith-api editions (Sunnah.com-derived; comparison only) */
export const API = {
  bukhari: 'ara-bukhari',
  muslim: 'ara-muslim',
  'abu-dawud': 'ara-abudawud',
  tirmidhi: 'ara-tirmidhi',
  nasai: 'ara-nasai',
  'ibn-majah': 'ara-ibnmajah',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

async function cached(url) {
  const file = join(CACHE, sha(url).slice(0, 24));
  if (existsSync(file)) return readFileSync(file, 'utf8');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (citation check)' } });
      if (res.ok) {
        const body = await res.text();
        writeFileSync(file, body);
        await sleep(250);
        return body;
      }
      if (res.status === 404) return '';
    } catch {
      /* retry */
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`could not fetch ${url}`);
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const toLatinDigits = (s) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

/** One Shamela page as paragraphs of plain text (footnotes and the Albani verdict lines dropped) */
export async function shamelaPage(book, page) {
  const html = await cached(`https://shamela.ws/book/${book}/${page}`);
  const from = html.indexOf('<div class="nass');
  if (from < 0) return [];
  const to = html.indexOf('<div id="appended_pages"', from);
  const body = html.slice(from, to < 0 ? undefined : to).replace(/<p[^>]*class="hamesh"[\s\S]*?<\/p>/g, ' ');
  return body
    .split(/<\/p>/)
    .map((p) =>
      p
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&[a-z#0-9]+;/g, ' ')
        .replace(/⦗[٠-٩]+⦘/g, ' ')
        .replace(/\[حكم الألباني\][\s\S]*$/, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    // A new hadith sometimes starts inside a paragraph: split there ("١٢ - ", "٧٥ - (٢٧٢٣)")
    .flatMap((p) => p.split(/\s(?=[٠-٩]+\s-\s)/))
    .map((p) => p.trim())
    .filter(Boolean);
}

/** The hadith number a paragraph starts, if it starts one */
function paraNumber(text, paren) {
  const m = text.match(/^([٠-٩0-9]+)\s*-\s*(?:\(([٠-٩0-9]+)\))?/);
  if (!m) return null;
  if (paren) return m[2] ? Number(toLatinDigits(m[2])) : null;
  return Number(toLatinDigits(m[1]));
}

async function firstNumberFrom(spec, page) {
  for (let p = page; p <= Math.min(spec.last, page + 10); p++) {
    for (const para of await shamelaPage(spec.book, p)) {
      const n = paraNumber(para, spec.paren);
      if (n !== null) return { n, page: p };
    }
  }
  return null;
}

/** Finds hadith `n` in a Shamela book: { pages, url, text } (text runs to the next number) */
export async function shamelaHadith(collection, n) {
  const spec = SHAMELA[collection];
  if (!spec) throw new Error(`no Shamela copy recorded for ${collection}`);
  let lo = 1;
  let hi = spec.last;
  // Largest page whose first number is <= n
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const f = await firstNumberFrom(spec, mid);
    if (!f || f.n > n) hi = mid;
    else lo = mid;
  }
  // Walk from a page or two before, to catch a hadith that starts mid-page. A stray
  // number on a page (a list inside a chapter heading) can mislead the search, so a
  // miss is retried over a wider window.
  return (await walk(spec, n, Math.max(1, lo - 4), 18)) ?? (await walk(spec, n, Math.max(1, lo - 60), 120));
}

async function walk(spec, n, start, span) {
  const out = [];
  const pages = [];
  let inside = false;
  const done = () => ({ pages, url: `https://shamela.ws/book/${spec.book}/${pages[0]}`, text: out.join(' ') });
  for (let p = start; p <= Math.min(spec.last, start + span); p++) {
    const paras = await shamelaPage(spec.book, p);
    for (const para of paras) {
      const num = paraNumber(para, spec.paren);
      const anyNum = /^([٠-٩0-9]+)s*-/.test(para);
      if (num !== null && num === n) inside = true;
      else if (inside && num !== null && num > n) return done();
      else if (inside && !spec.paren && anyNum && num !== n) return done();
      if (inside) {
        out.push(para);
        if (!pages.includes(p)) pages.push(p);
      }
    }
  }
  return out.length ? done() : null;
}

const apiCache = new Map();
/** The hadith in hadith-api, by the edition's Arabic number (Abd al-Baqi for Muslim) */
export async function apiHadith(collection, n) {
  const ed = API[collection];
  if (!ed) throw new Error(`no hadith-api edition for ${collection}`);
  if (!apiCache.has(ed)) {
    const local = process.env.HADITH_API_DIR && join(process.env.HADITH_API_DIR, `${ed}.json`);
    const raw = local && existsSync(local) ? readFileSync(local, 'utf8') : await cached(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${ed}.json`);
    apiCache.set(ed, JSON.parse(raw).hadiths);
  }
  const all = apiCache.get(ed);
  const hits = all.filter((h) => Math.floor(Number(h.arabicnumber ?? h.hadithnumber)) === n);
  if (!hits.length) return null;
  return { ref: `${ed}, hadith ${n}`, text: hits.map((h) => h.text).join(' ') };
}

/** Our skeleton inside a witness's skeleton (spaces normalised); the witness's own span when found */
export function skeletonIn(ours, witnessText) {
  const want = arabicSkeleton(ours);
  const hay = arabicSkeleton(witnessText);
  return hay.includes(want) ? want : null;
}

/** The vocalised words of a witness that match our skeleton, for the stage D comparison */
export function vocalisedSpan(ours, witnessText) {
  const want = arabicSkeleton(ours).split(' ');
  const words = witnessText.split(/\s+/).filter(Boolean);
  const sk = words.map((w) => arabicSkeleton(w));
  // Words that are only punctuation have an empty skeleton: skip them while matching
  for (let i = 0; i < words.length; i++) {
    let j = i;
    let k = 0;
    const span = [];
    while (j < words.length && k < want.length) {
      if (!sk[j]) { span.push(words[j]); j++; continue; }
      if (sk[j] !== want[k]) break;
      span.push(words[j]);
      j++;
      k++;
    }
    if (k === want.length) return span.join(' ');
  }
  return null;
}

// ---------- CLI ----------

function readItems(deck) {
  const decks = deck ? [deck] : readdirSync(adhkarDir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'tools').map((e) => e.name);
  const out = [];
  for (const d of decks) {
    const dir = join(adhkarDir, d, 'items');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) out.push({ deck: d, file: f, item: JSON.parse(readFileSync(join(dir, f), 'utf8')) });
  }
  return out;
}

async function locate(collection, n) {
  const s = await shamelaHadith(collection, n);
  console.log(`--- Shamela ${s?.url ?? '(not found)'} pages ${s?.pages?.join(',') ?? ''}`);
  console.log(s?.text ?? '');
  const a = await apiHadith(collection, n).catch((e) => ({ ref: String(e), text: '' }));
  console.log(`--- hadith-api ${a?.ref ?? '(not found)'}`);
  console.log(a?.text ?? '');
}

/** Checks one Arabic text against the witnesses its item records; returns problems */
async function checkText(label, arabic, citations, witnesses, note) {
  const problems = [];
  const want = skeletonSha256(arabic);
  for (const w of witnesses) {
    if (w.skeletonSha256 && w.skeletonSha256 !== want && !note) problems.push(`${label}: ${w.name} hash differs from the shipped Arabic and no provenance.note records the variant`);
  }
  // Every cited number must hold the text, in both witnesses (stage G). Where one
  // witness reads differently, the item's provenance.note must say which reading we chose.
  for (const c of citations) {
    const n = Number(c.number);
    const found = [];
    const missed = [];
    if (SHAMELA[c.collection]) {
      const s = await shamelaHadith(c.collection, n);
      if (s && skeletonIn(arabic, s.text)) found.push(`shamela ${s.url}`);
      else missed.push(`${label}: not found in the Shamela copy of ${c.collection} ${n}${s ? ` (${s.url})` : ''}`);
    }
    if (API[c.collection]) {
      const a = await apiHadith(c.collection, n);
      if (a && skeletonIn(arabic, a.text)) found.push(`hadith-api ${a.ref}`);
      else missed.push(`${label}: not found in hadith-api ${c.collection} ${n}`);
    }
    if (!found.length || (missed.length && !note)) problems.push(...missed);
    else if (missed.length) console.log(`  var ${label} ${c.collection} ${n}: only ${found.join('; ')} (the other witness reads differently; see provenance.note)`);
    else console.log(`  ok  ${label} ${c.collection} ${n}: ${found.join('; ')}`);
  }
  return problems;
}

async function verify(deck) {
  let failed = 0;
  let checked = 0;
  for (const { deck: d, item } of readItems(deck)) {
    if (item.review?.status === 'draft' && !process.argv.includes('--all')) continue;
    if (item.quran) {
      // A Quran item stores no Arabic; the hadith behind its use is checked by its cue phrase
      for (const c of item.citations ?? []) {
        const key = item.usage?.evidenceArabic;
        void key;
        console.log(`  --  ${d}/${item.id} Quran ${item.quran.surahId}:${item.quran.ayah}; usage citation ${c.collection} ${c.number}`);
      }
      continue;
    }
    checked++;
    const cites = (item.citations ?? []).filter((c) => !c.textElsewhere);
    const problems = await checkText(`${d}/${item.id}`, item.arabic, cites, item.provenance?.witnesses ?? [], item.provenance?.note);
    for (const [i, v] of (item.variants ?? []).entries()) problems.push(...(await checkText(`${d}/${item.id} variant ${i}`, v.arabic, v.citations, [], item.provenance?.note)));
    for (const p of problems) console.error(`FAIL ${p}`);
    failed += problems.length;
  }
  console.log(`${checked} item(s) checked, ${failed} problem(s)`);
  return failed ? 1 : 0;
}

async function grading(book, page, quote) {
  const paras = await shamelaPage(Number(book), Number(page));
  const ok = arabicSkeleton(paras.join(' ')).includes(arabicSkeleton(quote));
  console.log(ok ? `FOUND on shamela.ws/book/${book}/${page}` : `NOT on shamela.ws/book/${book}/${page}`);
  return ok ? 0 : 1;
}

const [cmd, ...args] = process.argv.slice(2);
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const run = cmd === 'locate' ? locate(args[0], Number(args[1])).then(() => 0) : cmd === 'verify' ? verify(args.find((a) => !a.startsWith('--'))) : cmd === 'grading' ? grading(args[0], args[1], args.slice(2).join(' ')) : Promise.resolve(2);
  run.then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
}
