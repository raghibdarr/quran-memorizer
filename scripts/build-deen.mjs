// Builds and checks the deen content (all-in-one spec 5.2 and 5.5).
//
//   node scripts/build-deen.mjs                 validate every deck and emit what passes
//   node scripts/build-deen.mjs --deck <id>     one deck (and its package glossary)
//   node scripts/build-deen.mjs --check         validate only; exit 1 on any error
//                                               (also run by vitest: content-integrity.test.ts)
//
// Authored items live one file per item under content/deen/<deck dir>/; the build
// emits src/data/deen/<deck>.json (only source-checked or scholar-reviewed items)
// and src/data/deen/glossary/<package>.json. Every one of the 15 guardrails below
// is an ERROR (the deck doesn't build, the deploy gate fails) except the "unmarked
// glossary term" half of G8, which warns.
//
// This file is also imported by the tests: everything is exported, and the CLI
// only runs when the file is executed directly.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- decks ----------

/** deck id → where it's authored, what it holds, which glossary package it belongs to */
export const DECKS = {
  nawawi40: { dir: 'nawawi40', kind: 'hadith', pkg: 'nawawi40' },
  'adhkar-morning-evening': { dir: 'adhkar/morning-evening', kind: 'dhikr', pkg: 'adhkar' },
  'adhkar-after-prayer': { dir: 'adhkar/after-prayer', kind: 'dhikr', pkg: 'adhkar' },
  'adhkar-sleep-waking': { dir: 'adhkar/sleep-waking', kind: 'dhikr', pkg: 'adhkar' },
  'duas-daily': { dir: 'adhkar/duas-daily', kind: 'dhikr', pkg: 'adhkar' },
  'salah-words': { dir: 'adhkar/salah-words', kind: 'dhikr', pkg: 'adhkar' },
  names99: { dir: 'names99', kind: 'names', pkg: 'names99' },
  'course-purification': { dir: 'course/purification', kind: 'course', pkg: 'course-purification' },
  'course-fasting': { dir: 'course/fasting', kind: 'course', pkg: 'course-fasting' },
};

/** Test-only deck: never emitted into src/data */
export const FIXTURE = { id: '_fixture', dir: '_fixture', kind: 'hadith', pkg: '_fixture' };

const EMITTABLE = new Set(['source-checked', 'scholar-reviewed']);
const STATUSES = new Set(['draft', 'source-checked', 'scholar-reviewed']);
const SCHOOLS = new Set(['hanafi', 'maliki', 'shafii', 'hanbali']);
const GRADES = new Set(['sahih', 'hasan', 'daif', 'mawquf', 'mursal', 'agreed-upon', 'in-sahih']);
const SAHIH_GRADES = new Set(['agreed-upon', 'in-sahih']);

// ---------- Arabic skeleton (identical to src/lib/deen/normalize-arabic.ts; a test keeps them in step) ----------

const STRIP = new RegExp(
  [
    '[ً-ٟ]',
    'ٰ',
    '[ؐ-ؚ]',
    '[ۖ-ۭ]',
    '[࣓-ࣿ]',
    'ـ',
    '[،؛؟٪-٭۔]',
    '[﴾﴿«»]',
    '[٠-٩۰-۹0-9]',
    '[.,:;!?"\'()\\[\\]{}\\-–—…]',
    '[​-‏‪-‮⁦-⁩﻿]',
  ].join('|'),
  'g',
);
const FOLD = {
  'آ': 'ا', 'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا',
  'ؤ': 'و', 'ئ': 'ي', 'ى': 'ي', 'ی': 'ي', 'ک': 'ك',
};

export function arabicSkeleton(text) {
  return text
    .normalize('NFC')
    .replace(STRIP, '')
    .replace(/[آأإٱٲٳؤئىیک]/g, (c) => FOLD[c])
    .replace(/\s+/g, ' ')
    .trim();
}

export function looseSkeleton(text) {
  return arabicSkeleton(text).replace(/[اء\s]/g, '');
}

export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
export const skeletonSha256 = (arabic) => sha256(arabicSkeleton(arabic));

// ---------- small helpers ----------

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
const words = (s) => (s.match(/\S+/g) ?? []).length;

/** JSON with sorted keys, so hashes don't depend on authoring order */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/**
 * The content hash ids.lock.json pins: everything except `rev`, `review` and
 * `parts`. The learning parts are layout over an unchanged text (where the
 * Arabic and its English are cut for memorising), so moving a cut is not a
 * correction and does not raise `rev` (STYLE.md, "Learning parts").
 */
export function itemHash(item) {
  const { rev: _rev, review: _review, parts: _parts, ...rest } = item;
  void _rev; void _review; void _parts;
  return sha256(canonical(rest)).slice(0, 16);
}

/** Words a learning part may not end on: the head of a name or of a construct (ibn, Abu, Abd, Umm) */
const NAME_HEADS = new Set(['بن', 'ابن', 'ابي', 'ابو', 'ابا', 'عبد', 'ام'].map((w) => arabicSkeleton(w)));
const NAME_LINK = new Set(['بن'].map((w) => arabicSkeleton(w)));
const HONORIFIC = /^[\uFDFA\uFDFB\uFD40-\uFD4F]/;

/**
 * The learning parts of a text item (`parts: { ar, en }`): character offsets
 * where each part ends, in the Arabic and in the translation, the last one
 * being the end of the text. Returns what is wrong, as messages (none = fine).
 * Checked: same count on both sides (two or more), increasing, in range, each
 * cut at a word break; no English cut inside square brackets; no Arabic cut
 * inside a name (after ibn, Abu, Abd, Umm; before ibn) or before an honorific;
 * every `segments` end and every translation paragraph break is also a cut.
 * @param {any} item
 * @returns {string[]}
 */
export function checkParts(item) {
  const out = [];
  const parts = item?.parts;
  if (parts === undefined) return out;
  if (item.quran !== undefined) return ['an item with `quran` takes no parts (it is learned ayah by ayah)'];
  if (!isObj(parts) || !Array.isArray(parts.ar) || !Array.isArray(parts.en)) return ['parts must be { ar: number[], en: number[] }'];
  const arabic = typeof item.arabic === 'string' ? item.arabic : '';
  const english = typeof item.translation === 'string' ? item.translation : '';
  if (parts.ar.length !== parts.en.length) out.push(`parts.ar has ${parts.ar.length} ends and parts.en has ${parts.en.length}: one English part per Arabic part`);
  if (parts.ar.length < 2) out.push('parts needs at least two parts (leave a short text whole, without `parts`)');
  for (const [side, ends, text] of [['ar', parts.ar, arabic], ['en', parts.en, english]]) {
    const rising = ends.every((e, i) => Number.isInteger(e) && e > 0 && e <= text.length && (i === 0 || e > ends[i - 1]));
    if (!rising) { out.push(`parts.${side} must be increasing offsets within the text`); continue; }
    if (ends[ends.length - 1] !== text.length) out.push(`parts.${side} must end at the end of the text (${text.length})`);
    let start = 0;
    ends.forEach((e, i) => {
      const piece = text.slice(start, e);
      if (i < ends.length - 1 && !(/\s/.test(text[e] ?? '') && /\S/.test(text[e - 1] ?? ''))) out.push(`parts.${side}[${i}] (${e}) is not at the end of a word`);
      if (!piece.trim()) out.push(`parts.${side}[${i}] is empty`);
      if (side === 'en' && (piece.match(/\[/g) ?? []).length !== (piece.match(/\]/g) ?? []).length) out.push(`parts.en[${i}] cuts inside square brackets`);
      if (side === 'ar') {
        const ws = piece.trim().split(/\s+/);
        const last = arabicSkeleton(ws[ws.length - 1] ?? '');
        const first = ws[0] ?? '';
        if (i < ends.length - 1 && NAME_HEADS.has(last)) out.push(`parts.ar[${i}] ends inside a name or construct ("${ws[ws.length - 1]}")`);
        if (i > 0 && NAME_LINK.has(arabicSkeleton(first))) out.push(`parts.ar[${i}] starts inside a name ("${first}")`);
        if (i > 0 && HONORIFIC.test(first)) out.push(`parts.ar[${i}] starts with an honorific that belongs to the part before`);
      }
      start = e;
    });
  }
  if (out.length) return out;
  const arEnds = new Set(parts.ar);
  for (const raw of Array.isArray(item.segments) ? item.segments : []) {
    // As the app reads them: an offset inside a word means that word's end
    let s = raw;
    while (s < arabic.length && !/\s/.test(arabic[s])) s++;
    if (!arEnds.has(s)) out.push(`segments end ${s} is not a parts.ar end: parts sit inside the reading segments`);
  }
  const enEnds = new Set(parts.en);
  for (const m of english.matchAll(/\n\s*\n/g)) {
    if (!enEnds.has(m.index)) out.push(`the translation's paragraph break at ${m.index} is not a parts.en end`);
  }
  return out;
}

// ---------- registry (collections, scholars, works, witnesses, reviewers) ----------

function findSidecars(contentDir, includeFixture) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === '_fixture' && !includeFixture) continue;
        walk(join(dir, e.name));
      } else if (e.name === 'registry-additions.json') out.push(join(dir, e.name));
    }
  };
  if (existsSync(contentDir)) walk(contentDir);
  return out.sort();
}

/** The shared registry plus every package's registry-additions.json sidecar */
export function loadRegistry(root = ROOT, { includeFixture = false } = {}) {
  const dir = join(root, 'content', 'deen');
  const collections = readJson(join(dir, 'collections.json'));
  const scholars = readJson(join(dir, 'scholars.json'));
  const works = readJson(join(dir, 'works.json'));
  const reviewers = readJson(join(dir, 'reviewers.json'));
  const reg = {
    collections: new Map(collections.collections.map((c) => [c.id, c])),
    numberings: new Map(collections.numberings.map((n) => [n.id, n])),
    scholars: new Map(scholars.scholars.map((s) => [s.id, s])),
    works: new Map(works.works.map((w) => [w.id, w])),
    witnesses: new Map(works.witnessSources.map((w) => [w.id, w])),
    reviewers: new Map(reviewers.map((r) => [r.id, r])),
    errors: [],
  };
  for (const file of findSidecars(dir, includeFixture)) {
    const add = readJson(file);
    const where = relative(root, file).replace(/\\/g, '/');
    const merge = (map, list, kind) => {
      for (const entry of list ?? []) {
        const prev = map.get(entry.id);
        if (prev && canonical(prev) !== canonical(entry)) {
          reg.errors.push({ code: 'REG', deck: '-', id: entry.id, msg: `${where} redefines ${kind} "${entry.id}" differently` });
        } else map.set(entry.id, entry);
      }
    };
    merge(reg.collections, add.collections, 'collection');
    merge(reg.numberings, add.numberings, 'numbering');
    merge(reg.scholars, add.scholars, 'scholar');
    merge(reg.works, add.works, 'work');
    merge(reg.witnesses, add.witnessSources, 'witness source');
  }
  return reg;
}

// ---------- glossaries ----------

/** Every glossary file: core.json and glossary/<package>.json (G13 conflicts reported) */
export function loadGlossaries(root = ROOT, { includeFixture = false } = {}) {
  const dir = join(root, 'content', 'deen', 'glossary');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const sources = files.map((f) => ({ name: f.replace(/\.json$/, ''), terms: readJson(join(dir, f)) }));
  const fixture = join(root, 'content', 'deen', '_fixture', 'glossary.json');
  if (includeFixture && existsSync(fixture)) sources.push({ name: '_fixture', terms: readJson(fixture) });
  return mergeGlossaries(sources);
}

export function mergeGlossaries(sources) {
  const terms = new Map();
  const owner = new Map();
  const errors = [];
  for (const { name, terms: list } of sources) {
    for (const t of list) {
      errors.push(...checkTermShape(t, name));
      const prev = terms.get(t.id);
      if (prev && canonical(prev) !== canonical(t)) {
        errors.push({ code: 'G13', deck: `glossary/${name}`, id: t.id, msg: `defined differently in glossary/${owner.get(t.id)}.json and glossary/${name}.json` });
      } else if (!prev) {
        terms.set(t.id, t);
        owner.set(t.id, name);
      }
    }
  }
  return { terms, sources, errors };
}

function checkTermShape(t, file) {
  const errs = [];
  const at = (msg) => ({ code: 'SHAPE', deck: `glossary/${file}`, id: t?.id ?? '?', msg });
  if (!isObj(t) || !/^[a-z0-9-]+$/.test(t.id ?? '')) return [at('a term needs a lower-case id')];
  if (!nonEmpty(t.translit) || !nonEmpty(t.short)) errs.push(at('a term needs translit and short'));
  errs.push(...checkArabic(t.arabic, { deck: `glossary/${file}`, id: t.id }, 'arabic'));
  return errs;
}

// ---------- Quran ----------

/** Reads ayah text from src/data/surah-N.json, lazily */
export function quranLookup(root = ROOT) {
  const cache = new Map();
  const surah = (id) => {
    if (!cache.has(id)) {
      const p = join(root, 'src', 'data', `surah-${id}.json`);
      cache.set(id, existsSync(p) ? readJson(p) : null);
    }
    return cache.get(id);
  };
  return {
    count: (id) => surah(id)?.versesCount ?? 0,
    text: (id, ayah) => surah(id)?.ayahs?.find((a) => a.number === ayah)?.textUthmani ?? null,
  };
}

// ---------- the guardrails ----------

const ARABIC_ALLOWED = /^[؀-ؿف-ۿݐ-ݿࢠ-ࣿ﴾﴿ﷺ\s«»().:!"\-]*$/u;

/** G7: NFC, Arabic code points only, no tatweel, no Latin */
export function checkArabic(text, where, field) {
  if (text === undefined) return [];
  const err = (msg) => ({ code: 'G7', deck: where.deck, id: where.id, msg: `${field}: ${msg}` });
  if (typeof text !== 'string' || !text.trim()) return [err('must be non-empty text')];
  const out = [];
  if (text.normalize('NFC') !== text) out.push(err('is not Unicode NFC'));
  if (text.includes('ـ')) out.push(err('contains tatweel (U+0640)'));
  if (/[A-Za-z]/.test(text)) out.push(err('contains Latin letters'));
  if (/[0-9٠-٩۰-۹]/.test(text)) out.push(err('contains digits (write numbers as words, or leave verse numbers out)'));
  if (!ARABIC_ALLOWED.test(text)) {
    const bad = [...text].find((c) => !ARABIC_ALLOWED.test(c));
    out.push(err(`contains a character outside the allowed Arabic set (U+${bad.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`));
  }
  return out;
}

const RULING_WORDS = /\b(obligatory|compulsory|mandatory|must|forbidden|prohibited|unlawful|lawful|permissible|impermissible|permitted|not allowed|invalid|invalidates|required|recommended|disliked|sinful|haram|halal|makruh|mustahabb|wajib|fard)\b|\[\[(fard|wajib|haram|halal|makruh|mustahabb)\]\]/i;
const BANNED = [
  /\b(the )?(more |most )?(correct|strongest|stronger|right|soundest|sounder|preferred|true|rajih) (opinion|view|position)\b/i,
];
const SCHOLARS_AGREE = /\b((the )?scholars (all |have |have all |unanimously )?(agree|agreed|are agreed|are unanimous|concur)|all (of )?(the )?scholars|by consensus|unanimously|there is (a |no )?(consensus|disagreement|difference of opinion))\b/i;

/** Every free-text field of an item, with a label, for G8/G12 scans */
function textFields(kind, item) {
  const out = [];
  const push = (label, v) => { if (typeof v === 'string') out.push([label, v]); };
  push('title', item.title);
  push('cue', item.cue);
  push('translation', item.translation);
  push('meaning', item.meaning);
  push('explanation', item.explanation);
  push('intro', item.intro);
  (item.notes ?? []).forEach((n, i) => push(`notes[${i}]`, n?.text));
  if (item.usage) (item.usage.when ?? []).forEach((w, i) => push(`usage.when[${i}]`, w));
  if (kind === 'course') {
    (item.claims ?? []).forEach((c, i) => {
      push(`claims[${i}].text`, c?.text);
      (c?.positions ?? []).forEach((p, j) => push(`claims[${i}].positions[${j}]`, p?.text));
      (c?.cards ?? []).forEach((k, j) => { push(`claims[${i}].cards[${j}].front`, k?.front); push(`claims[${i}].cards[${j}].back`, k?.back); });
    });
    (item.check ?? []).forEach((q, i) => { push(`check[${i}].q`, q?.q); (q?.options ?? []).forEach((o, j) => push(`check[${i}].options[${j}]`, o)); });
  }
  return out;
}

function checkQuranRef(ref, quran, where, label) {
  const err = (msg) => ({ code: 'G5', deck: where.deck, id: where.id, msg: `${label}: ${msg}` });
  if (!isObj(ref)) return [err('must be { surahId, ayah, ayahEnd? }')];
  const { surahId, ayah, ayahEnd } = ref;
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) return [err(`surah ${surahId} does not exist`)];
  const count = quran.count(surahId);
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > count) return [err(`ayah ${surahId}:${ayah} does not exist`)];
  if (ayahEnd !== undefined && (!Number.isInteger(ayahEnd) || ayahEnd < ayah || ayahEnd > count)) return [err(`ayah range ${surahId}:${ayah}-${ayahEnd} does not exist`)];
  return [];
}

const hasSource = (s) => isObj(s) && nonEmpty(s.work) && nonEmpty(s.location);

/**
 * Validates one deck's items. `ctx` = { registry, glossary (Map), quran, knownItems? (Set of "deck:id") }.
 * Returns { errors, warnings, emitted (sorted items that ship), lock (the updated ids.lock) }.
 * @param {{ deck: string, kind: string, items: Array<{ file: string, data: any }>, lock?: any, unit?: any }} deckInput
 * @param {any} ctx
 */
export function validateDeck({ deck, kind, items, lock, unit }, ctx) {
  const errors = [];
  const warnings = [];
  const E = (code, id, msg) => errors.push({ code, deck, id, msg });
  const W = (code, id, msg) => warnings.push({ code, deck, id, msg });
  const { registry: reg, glossary, quran } = ctx;
  const seen = new Set();

  for (const { file, data: item } of items) {
    const id = item?.id ?? file;
    const where = { deck, id };

    // Shape basics
    if (!isObj(item) || !nonEmpty(item.id)) { E('SHAPE', file, 'an item needs an id'); continue; }
    if (file && file !== item.id) E('SHAPE', id, `id "${item.id}" doesn't match its file name "${file}.json"`);
    if (seen.has(item.id)) E('SHAPE', id, 'duplicate id');
    seen.add(item.id);
    if (!Number.isInteger(item.rev) || item.rev < 1) E('SHAPE', id, 'rev must be a positive integer');
    if (kind !== 'names' && kind !== 'course' && item.deck !== deck) E('SHAPE', id, `deck must be "${deck}"`);
    if (kind === 'course' && unit && item.unit !== unit.id) E('SHAPE', id, `unit must be "${unit.id}"`);

    // G1: every item has a review with a known status; reviewers are named in reviewers.json
    if (!isObj(item.review) || !STATUSES.has(item.review.status)) {
      E('G1', id, 'every item needs review.status: draft, source-checked or scholar-reviewed');
      continue;
    }
    if (item.review.status === 'scholar-reviewed') {
      const by = item.review.by ?? [];
      if (!by.length || by.some((r) => !reg.reviewers.has(r))) E('G1', id, 'scholar-reviewed needs review.by naming reviewers listed in reviewers.json');
    }
    const ships = EMITTABLE.has(item.review.status);

    if (kind === 'hadith' || kind === 'dhikr') {
      const isQuran = item.quran !== undefined;
      if (!nonEmpty(item.title) || !nonEmpty(item.cue)) E('SHAPE', id, 'title and cue are required');
      if (!Array.isArray(item.citations) || !Array.isArray(item.gradings)) E('SHAPE', id, 'citations and gradings must be arrays (empty is fine for a Quran item)');

      // G5: Quran refs resolve; a Quran item stores no Arabic or translation of its own
      if (isQuran) {
        errors.push(...checkQuranRef(item.quran, quran, where, 'quran'));
        if (item.arabic !== undefined || item.translation !== undefined) E('G5', id, 'an item with `quran` must not store arabic or translation');
      }

      if (!isQuran) {
        if (!nonEmpty(item.arabic)) E('SHAPE', id, 'a non-Quran item needs arabic');
        if (!nonEmpty(item.translation)) E('SHAPE', id, 'a non-Quran item needs translation');

        // G2: a citation with a known collection, a number and a known numbering
        const cites = Array.isArray(item.citations) ? item.citations : [];
        if (!cites.length) E('G2', id, 'needs at least one citation');
        for (const [i, c] of cites.entries()) {
          if (!reg.collections.has(c?.collection)) E('G2', id, `citations[${i}]: unknown collection "${c?.collection}"`);
          if (!nonEmpty(c?.number)) E('G2', id, `citations[${i}]: number is required`);
          if (!reg.numberings.has(c?.numbering)) E('G2', id, `citations[${i}]: unknown numbering "${c?.numbering}"`);
          else if (reg.collections.has(c.collection) && !(reg.numberings.get(c.numbering).for ?? []).includes(c.collection)) {
            E('G2', id, `citations[${i}]: numbering "${c.numbering}" is not a scheme for "${c.collection}"`);
          }
        }

        // G3: anything not in the two Sahihs needs an attributed grading
        const inSahih = cites.some((c) => reg.collections.get(c?.collection)?.sahih === true)
          || (item.gradings ?? []).some((g) => SAHIH_GRADES.has(g?.grade));
        if (!inSahih && !(item.gradings ?? []).length) E('G3', id, 'not in al-Bukhari or Muslim: needs a grading with `by` and `in`');
        // Inclusion rule (spec 5.1): outside the two Sahihs, at least one located verdict
        // must be sahih or hasan. A narration every located authority finds weak is not
        // in a deck (it goes on /sources under "not included, and why").
        else if (!inSahih && ships && !(item.gradings ?? []).some((g) => g?.grade === 'sahih' || g?.grade === 'hasan')) {
          E('G3', id, 'not in al-Bukhari or Muslim and no located verdict of sahih or hasan: it cannot ship (spec 5.1 inclusion rule)');
        }

        // G2 again: a variant wording is cited like the item itself
        for (const [vi, v] of (Array.isArray(item.variants) ? item.variants : []).entries()) {
          const vc = Array.isArray(v?.citations) ? v.citations : [];
          if (!vc.length) E('G2', id, `variants[${vi}] needs at least one citation`);
          for (const [i, c] of vc.entries()) {
            if (!reg.collections.has(c?.collection)) E('G2', id, `variants[${vi}].citations[${i}]: unknown collection "${c?.collection}"`);
            if (!nonEmpty(c?.number)) E('G2', id, `variants[${vi}].citations[${i}]: number is required`);
            if (!reg.numberings.has(c?.numbering)) E('G2', id, `variants[${vi}].citations[${i}]: unknown numbering "${c?.numbering}"`);
            else if (reg.collections.has(c.collection) && !(reg.numberings.get(c.numbering).for ?? []).includes(c.collection)) {
              E('G2', id, `variants[${vi}].citations[${i}]: numbering "${c.numbering}" is not a scheme for "${c.collection}"`);
            }
          }
        }

        // G4: two witnesses, not all Sunnah.com-derived, skeleton hashes match (or a variant note)
        const wit = item.provenance?.witnesses;
        if (!Array.isArray(wit) || wit.length < 2) E('G4', id, 'needs provenance.witnesses: at least two');
        else {
          const names = wit.map((w) => w?.name);
          if (new Set(names).size !== names.length) E('G4', id, 'witnesses must be distinct sources');
          for (const n of names) if (!reg.witnesses.has(n)) E('G4', id, `unknown witness source "${n}" (add it to works.json witnessSources or a sidecar)`);
          if (names.every((n) => reg.witnesses.get(n)?.sunnahComDerived)) E('G4', id, 'at least one witness must not derive from Sunnah.com');
          for (const w of wit) if (!nonEmpty(w?.ref)) E('G4', id, `witness "${w?.name}" needs a ref (edition, volume, page or URL)`);
          if (nonEmpty(item.arabic)) {
            const want = skeletonSha256(item.arabic);
            const mismatched = wit.filter((w) => w?.skeletonSha256 !== want);
            if (mismatched.length && !nonEmpty(item.provenance.note)) {
              E('G4', id, `skeleton hash differs for ${mismatched.map((w) => w?.name).join(', ')} and no provenance.note records the variant chosen`);
            }
          }
        }

        // G7 on the Arabic and variants
        errors.push(...checkArabic(item.arabic, where, 'arabic'));
        (item.variants ?? []).forEach((v, i) => errors.push(...checkArabic(v?.arabic, where, `variants[${i}].arabic`)));

        // G15: translation length against the Arabic
        if (nonEmpty(item.arabic) && nonEmpty(item.translation)) {
          const a = words(arabicSkeleton(item.arabic));
          const e = words(item.translation.replace(/\[\[([a-z0-9-]+)\]\]/g, '$1'));
          if (e < 0.6 * a || e > 2.5 * a) E('G15', id, `translation is ${e} words for ${a} Arabic words (allowed 0.6x to 2.5x)`);
        }
      }

      // Every grading present is attributed (G3)
      for (const [i, g] of (item.gradings ?? []).entries()) {
        if (!GRADES.has(g?.grade)) E('G3', id, `gradings[${i}]: unknown grade "${g?.grade}"`);
        if (!reg.scholars.has(g?.by)) E('G3', id, `gradings[${i}]: \`by\` must be a known scholar, got "${g?.by}"`);
        if (!nonEmpty(g?.in)) E('G3', id, `gradings[${i}]: \`in\` (where the verdict was found) is required`);
        errors.push(...checkArabic(g?.quote, where, `gradings[${i}].quote`));
      }

      // G9 + G15: notes are sourced, at most three
      const notes = item.notes ?? [];
      if (notes.length > 3) E('G15', id, `${notes.length} notes; at most 3`);
      notes.forEach((n, i) => { if (!hasSource(n?.source)) E('G9', id, `notes[${i}] needs source { work, location }`); });

      if (Array.isArray(item.segments)) {
        const len = (item.arabic ?? '').length;
        if (!item.segments.every((s, i, a) => Number.isInteger(s) && s > 0 && s <= len && (i === 0 || s > a[i - 1]))) {
          E('SHAPE', id, 'segments must be increasing offsets within the Arabic');
        }
      }
      for (const msg of checkParts(item)) E('PARTS', id, msg);
    }

    if (kind === 'names') {
      if (!Number.isInteger(item.order)) E('SHAPE', id, 'order is required');
      for (const f of ['arabic', 'transliteration', 'meaning']) if (!nonEmpty(item[f])) E('SHAPE', id, `${f} is required`);
      errors.push(...checkArabic(item.arabic, where, 'arabic'));
      const ev = item.evidence;
      if (!isObj(ev) || !['quran-name', 'quran-derived', 'hadith', 'list-only'].includes(ev.kind)) E('SHAPE', id, 'evidence.kind is required');
      else {
        (ev.quran ?? []).forEach((r, i) => errors.push(...checkQuranRef(r, quran, where, `evidence.quran[${i}]`)));
        if (ev.form !== undefined) errors.push(...checkArabic(ev.form, where, 'evidence.form'));
        // A Name's evidence is never bare: derived-from-the-Quran cites the ayah, a hadith Name says which
        if (ev.kind === 'quran-derived' && !(ev.quran ?? []).length) E('G6', id, 'a quran-derived Name must cite the ayah it is derived from');
        if (ev.kind === 'hadith' && !nonEmpty(ev.hadith)) E('G6', id, 'a hadith Name must say which hadith (evidence.hadith)');
        // G6: a Name taken from the Quran appears in the ayah cited for it
        if (ev.kind === 'quran-name') {
          const refs = ev.quran ?? [];
          if (!refs.length) E('G6', id, 'a quran-name Name must cite the ayah it appears in');
          const needle = looseSkeleton(ev.form ?? item.arabic ?? '').replace(/^ل/, '');
          for (const r of refs) {
            const ayahs = [];
            for (let a = r.ayah; a <= (r.ayahEnd ?? r.ayah); a++) ayahs.push(quran.text(r.surahId, a) ?? '');
            const hay = looseSkeleton(ayahs.join(' '));
            if (needle && hay && !hay.includes(needle)) E('G6', id, `${r.surahId}:${r.ayah} does not contain the Name's skeleton`);
          }
        }
      }
      // G9: an explanation carries its source
      if (nonEmpty(item.explanation) && !hasSource(item.explanationSource)) E('G9', id, 'explanation needs explanationSource { work, location }');
    }

    if (kind === 'course') {
      if (!nonEmpty(item.title) || !nonEmpty(item.intro)) E('SHAPE', id, 'title and intro are required');
      // G11: the intro is short and makes no rulings
      if (nonEmpty(item.intro)) {
        if (words(item.intro) > 60) E('G11', id, `intro is ${words(item.intro)} words; at most 60`);
        const m = RULING_WORDS.exec(item.intro);
        if (m) E('G11', id, `intro uses ruling vocabulary ("${m[0]}"); rulings live only in claims`);
      }
      const claims = Array.isArray(item.claims) ? item.claims : [];
      if (claims.length > 6) E('G15', id, `${claims.length} claims; at most 6 per lesson`);
      const claimIds = new Set();
      for (const [i, c] of claims.entries()) {
        const label = `claims[${i}]`;
        if (!nonEmpty(c?.id) || !nonEmpty(c?.text)) { E('SHAPE', id, `${label} needs id and text`); continue; }
        claimIds.add(c.id);
        const ev = Array.isArray(c.evidence) ? c.evidence : [];
        for (const [j, e] of ev.entries()) {
          if (e?.quran) errors.push(...checkQuranRef(e.quran, quran, where, `${label}.evidence[${j}].quran`));
          else if (e?.item !== undefined) {
            if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(e.item)) E('G10', id, `${label}.evidence[${j}].item must be "<deck>:<itemId>"`);
            else if (ctx.knownItems && ctx.knownDecks?.has(e.item.split(':')[0]) && !ctx.knownItems.has(e.item)) E('G10', id, `${label}.evidence[${j}].item "${e.item}" does not exist`);
          } else if (e?.consensus) { if (!hasSource(e.consensus)) E('G10', id, `${label}.evidence[${j}].consensus needs work and location`); }
          else E('G10', id, `${label}.evidence[${j}] must be quran, item or consensus`);
        }
        // G10: differences have two sourced positions; agreement has evidence
        // A school's position is sourced wherever it appears, not only under "differs"
        const pos = Array.isArray(c.positions) ? c.positions : [];
        for (const [j, p] of pos.entries()) {
          if (!SCHOOLS.has(p?.school)) E('G10', id, `${label}.positions[${j}]: unknown school "${p?.school}"`);
          if (!nonEmpty(p?.text)) E('G10', id, `${label}.positions[${j}] needs text`);
          if (!hasSource(p?.source)) E('G10', id, `${label}.positions[${j}] needs source { work, location }`);
          errors.push(...checkArabic(p?.quote, where, `${label}.positions[${j}].quote`));
        }
        if (new Set(pos.map((p) => p?.school)).size !== pos.length) E('G10', id, `${label}: one position per school`);
        if (c.kind === 'differs') {
          if (pos.length < 2) E('G10', id, `${label}: a "differs" claim needs at least two positions`);
        } else if (c.kind === 'agreed') {
          if (!ev.length) E('G10', id, `${label}: an "agreed" claim needs consensus, Quran or hadith evidence`);
        } else if (!['definition', 'how-to'].includes(c.kind)) E('SHAPE', id, `${label}: unknown kind "${c.kind}"`);
        // G12: banned phrasing; "scholars agree" only with a consensus citation
        const hasConsensus = ev.some((e) => e?.consensus);
        for (const [f, text] of [['text', c.text], ...(c.positions ?? []).map((p, j) => [`positions[${j}]`, p?.text]), ...(c.cards ?? []).flatMap((k, j) => [[`cards[${j}].front`, k?.front], [`cards[${j}].back`, k?.back]])]) {
          if (typeof text !== 'string') continue;
          for (const re of BANNED) if (re.test(text)) E('G12', id, `${label}.${f}: banned phrasing "${text.match(re)[0]}"`);
          if (SCHOLARS_AGREE.test(text) && !hasConsensus) E('G12', id, `${label}.${f}: "${text.match(SCHOLARS_AGREE)[0]}" needs a consensus citation`);
        }
        for (const [j, k] of (c.cards ?? []).entries()) {
          if (!nonEmpty(k?.id) || !nonEmpty(k?.front) || !nonEmpty(k?.back)) E('SHAPE', id, `${label}.cards[${j}] needs id, front and back`);
          if (k?.school !== undefined && !SCHOOLS.has(k.school)) E('SHAPE', id, `${label}.cards[${j}]: unknown school "${k.school}"`);
        }
      }
      for (const [i, q] of (item.check ?? []).entries()) {
        if (!Array.isArray(q?.options) || !Number.isInteger(q?.answer) || q.answer < 0 || q.answer >= q.options.length) E('SHAPE', id, `check[${i}]: answer must index an option`);
        if (!claimIds.has(q?.claim)) E('SHAPE', id, `check[${i}]: claim "${q?.claim}" is not in this lesson`);
        // G12 on the question and its options; "scholars agree" leans on the claim it tests
        const tested = claims.find((c) => c?.id === q?.claim);
        const testedHasConsensus = (Array.isArray(tested?.evidence) ? tested.evidence : []).some((e) => e?.consensus);
        for (const text of [q?.q, ...(Array.isArray(q?.options) ? q.options : [])]) {
          if (typeof text !== 'string') continue;
          for (const re of BANNED) if (re.test(text)) E('G12', id, `check[${i}]: banned phrasing "${text.match(re)[0]}"`);
          if (SCHOLARS_AGREE.test(text) && !testedHasConsensus) E('G12', id, `check[${i}]: "${text.match(SCHOLARS_AGREE)[0]}" needs a consensus citation on the claim it tests`);
        }
      }
      // G12 on the lesson's own words: a title or intro has no evidence to lean on
      for (const [f, text] of [['title', item.title], ['intro', item.intro]]) {
        if (typeof text !== 'string') continue;
        for (const re of BANNED) if (re.test(text)) E('G12', id, `${f}: banned phrasing "${text.match(re)[0]}"`);
        if (SCHOLARS_AGREE.test(text)) E('G12', id, `${f}: "${text.match(SCHOLARS_AGREE)[0]}" belongs in a claim with a consensus citation`);
      }
    }

    // G8: every [[term]] resolves; known transliterations left unmarked are flagged
    for (const [label, text] of textFields(kind, item)) {
      for (const m of text.matchAll(/\[\[([^\]]*)\]\]/g)) {
        if (!glossary.has(m[1])) E('G8', id, `${label}: [[${m[1]}]] is not in any glossary`);
      }
      const bare = text.replace(/\[\[[^\]]*\]\]/g, ' ');
      for (const t of glossary.values()) {
        for (const form of new Set([t.translit, t.id])) {
          if (form.length < 4) continue;
          // "al-" before the form makes it a person's name (al-Hasan ibn Ali), not the term
          const re = new RegExp(`(^|[^\\p{L}'’])(?<!al-)${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}'’])`, 'iu');
          if (re.test(bare)) { W('G8', id, `${label}: "${form}" appears unmarked; write [[${t.id}]] or plain English`); break; }
        }
      }
    }

    // G1 again: drafts never ship (reported, not an error)
    if (!ships) W('DRAFT', id, `status ${item.review.status}: not emitted`);
  }

  // G14: locked ids never disappear; a changed item raises its rev
  const byId = new Map(items.map(({ data }) => [data?.id, data]));
  const nextLock = { ids: { ...(lock?.ids ?? {}) } };
  for (const [lid, entry] of Object.entries(lock?.ids ?? {})) {
    const item = byId.get(lid);
    if (!item) { E('G14', lid, 'is in ids.lock.json but its file is gone (ids never disappear)'); continue; }
    if (!EMITTABLE.has(item.review?.status) && !nonEmpty(entry.withdrawn)) {
      E('G14', lid, 'was shipped and is now below source-checked; set "withdrawn": "<reason>" on its lock entry and add an ERRATA.md line');
    }
    const h = itemHash(item);
    if (item.rev < entry.rev) { E('G14', lid, `rev went down (${entry.rev} to ${item.rev}): a rev only rises`); continue; }
    if (h !== entry.hash) {
      if (!(item.rev > entry.rev)) E('G14', lid, `content changed since rev ${entry.rev}: raise rev`);
      else nextLock.ids[lid] = { ...entry, rev: item.rev, hash: h };
    } else if (item.rev !== entry.rev) {
      nextLock.ids[lid] = { ...entry, rev: item.rev };
    }
  }
  const emitted = items
    .map(({ data }) => data)
    .filter((it) => isObj(it) && EMITTABLE.has(it.review?.status))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const it of emitted) {
    if (!nextLock.ids[it.id]) nextLock.ids[it.id] = { rev: it.rev, hash: itemHash(it) };
  }
  nextLock.ids = Object.fromEntries(Object.entries(nextLock.ids).sort(([a], [b]) => (a < b ? -1 : 1)));
  const lockChanged = canonical(nextLock) !== canonical({ ids: lock?.ids ?? {} });

  const blocked = new Set(errors.map((e) => e.id));
  return { errors, warnings, emitted: emitted.filter((it) => !blocked.has(it.id)), lock: nextLock, lockChanged };
}

// ---------- reading a deck from disk ----------

export function deckSpec(id) {
  if (id === FIXTURE.id) return FIXTURE;
  return DECKS[id] ?? null;
}

/** null when the deck has no authored content yet */
export function readDeck(root, id) {
  const spec = deckSpec(id);
  if (!spec) throw new Error(`Unknown deck "${id}"`);
  const dir = join(root, 'content', 'deen', spec.dir);
  const itemDir = join(dir, spec.kind === 'course' ? 'lessons' : 'items');
  if (!existsSync(itemDir)) return null;
  const items = readdirSync(itemDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f.replace(/\.json$/, ''), data: readJson(join(itemDir, f)) }));
  const lockPath = join(dir, 'ids.lock.json');
  const lock = existsSync(lockPath) ? readJson(lockPath) : { ids: {} };
  const unitPath = join(dir, 'unit.json');
  const unit = spec.kind === 'course' && existsSync(unitPath) ? readJson(unitPath) : undefined;
  // A course unit's own evidence hadith (content/deen/course/<unit>/evidence/*.json), cited by
  // lessons as { item: "<deck>-evidence:<id>" } and emitted as `evidence` beside the lessons
  const evidenceDir = join(dir, 'evidence');
  const evidence = spec.kind === 'course' && existsSync(evidenceDir)
    ? readdirSync(evidenceDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => ({ file: f.replace(/.json$/, ''), data: readJson(join(evidenceDir, f)) }))
    : [];
  return { deck: id, kind: spec.kind, pkg: spec.pkg, dir, lockPath, items, lock, unit, evidence };
}

/** The pseudo-deck id a course unit's evidence items are cited under */
export const evidenceDeckId = (id) => `${id}-evidence`;

/** The ids every authored deck holds, for cross-deck evidence checks */
function knownItemIds(root) {
  const items = new Set();
  const decks = new Set();
  for (const id of Object.keys(DECKS)) {
    const d = readDeck(root, id);
    if (!d) continue;
    decks.add(id);
    for (const { data } of d.items) if (data?.id) items.add(`${id}:${data.id}`);
    if (d.evidence?.length) {
      decks.add(evidenceDeckId(id));
      for (const { data } of d.evidence) if (data?.id && EMITTABLE.has(data?.review?.status)) items.add(`${evidenceDeckId(id)}:${data.id}`);
    }
  }
  return { items, decks };
}

/**
 * @param {string} [root]
 * @param {{ includeFixture?: boolean }} [opts]
 */
export function makeContext(root = ROOT, { includeFixture = false } = {}) {
  const registry = loadRegistry(root, { includeFixture });
  const glossary = loadGlossaries(root, { includeFixture });
  const known = knownItemIds(root);
  return { registry, glossary: glossary.terms, glossaryResult: glossary, quran: quranLookup(root), knownItems: known.items, knownDecks: known.decks };
}

/**
 * Validate decks (all authored ones by default). Returns { errors, warnings, results }
 * @param {string} [root]
 * @param {{ decks?: string[], includeFixture?: boolean }} [opts]
 */
export function checkAll(root = ROOT, { decks, includeFixture = false } = {}) {
  const ctx = makeContext(root, { includeFixture });
  const errors = [...ctx.registry.errors, ...ctx.glossaryResult.errors];
  const warnings = [];
  const results = {};
  const ids = decks ?? Object.keys(DECKS);
  for (const id of ids) {
    const d = readDeck(root, id);
    if (!d) continue;
    const r = validateDeck(d, ctx);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (r.lockChanged) errors.push({ code: 'G14', deck: id, id: '-', msg: 'ids.lock.json is out of date: run node scripts/build-deen.mjs --deck ' + id });
    // Evidence hadith get every hadith guardrail; they make no cards, so they have no ids lock
    let evidence = [];
    if (d.evidence?.length) {
      const ev = validateDeck({ deck: evidenceDeckId(id), kind: 'hadith', items: d.evidence, lock: { ids: {} } }, ctx);
      errors.push(...ev.errors);
      warnings.push(...ev.warnings);
      r.errors.push(...ev.errors);
      evidence = ev.emitted;
    }
    results[id] = { ...r, evidence, spec: d };
  }
  return { errors, warnings, results, ctx };
}

// ---------- emitting ----------

function emittedDeckJson(id, kind, items, evidence = []) {
  const strip = (it) => {
    const { review, ...rest } = it;
    // The review log is authoring history; the app needs the status (and named reviewers)
    return { ...rest, review: { status: review.status, ...(review.by ? { by: review.by } : {}), ...(review.date ? { date: review.date } : {}) } };
  };
  const clean = items.map(strip);
  if (!evidence.length) return { deck: id, kind, hash: sha256(canonical(clean)).slice(0, 16), items: clean };
  const ev = evidence.map(strip);
  return { deck: id, kind, hash: sha256(canonical({ items: clean, evidence: ev })).slice(0, 16), items: clean, evidence: ev };
}

/**
 * Validate and emit decks. Refuses to write a deck with errors. With `outDir`
 * (tests) everything is written there instead of src/data/deen.
 */
/**
 * @param {string} [root]
 * @param {{ decks?: string[], outDir?: string, includeFixture?: boolean, writeLock?: boolean }} [opts]
 */
export function build(root = ROOT, { decks, outDir, includeFixture = false, writeLock = true } = {}) {
  const res = checkAll(root, { decks, includeFixture });
  const out = outDir ?? join(root, 'src', 'data', 'deen');
  const written = [];
  // Lock staleness is not an error when building: the build writes the lock
  const realErrors = res.errors.filter((e) => !(e.code === 'G14' && e.id === '-'));
  for (const [id, r] of Object.entries(res.results)) {
    if (r.errors.length) continue;
    mkdirSync(out, { recursive: true });
    const file = join(out, `${id}.json`);
    writeFileSync(file, JSON.stringify(emittedDeckJson(id, r.spec.kind, r.emitted, r.evidence), null, 1) + '\n');
    written.push(file);
    if (writeLock && r.lockChanged) writeFileSync(r.spec.lockPath, JSON.stringify(r.lock, null, 2) + '\n');
  }
  // Glossaries: core always (when building everything), and each built deck's package
  const pkgs = new Set(Object.keys(res.results).map((id) => deckSpec(id).pkg));
  if (!decks) pkgs.add('core');
  const gdir = join(out, 'glossary');
  for (const src of res.ctx.glossaryResult.sources) {
    if (!pkgs.has(src.name) || src.name === '_fixture') continue;
    if (res.ctx.glossaryResult.errors.some((e) => e.deck === `glossary/${src.name}`)) continue;
    mkdirSync(gdir, { recursive: true });
    const sorted = [...src.terms].sort((a, b) => (a.id < b.id ? -1 : 1));
    const file = join(gdir, `${src.name}.json`);
    writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
    written.push(file);
  }
  return { ...res, errors: realErrors, written };
}

// ---------- CLI ----------

function report(res) {
  const byCode = (list) => list.map((e) => `  ${e.code.padEnd(5)} ${e.deck} ${e.id}: ${e.msg}`).join('\n');
  const warn = res.warnings.filter((w) => w.code !== 'DRAFT');
  const drafts = res.warnings.filter((w) => w.code === 'DRAFT');
  if (warn.length) console.log(`Warnings (${warn.length}):\n${byCode(warn)}`);
  if (drafts.length) console.log(`Not emitted (draft): ${drafts.length}`);
  if (res.errors.length) console.error(`Errors (${res.errors.length}):\n${byCode(res.errors)}`);
  const decks = Object.entries(res.results).map(([id, r]) => `${id}: ${r.emitted.length} shipped of ${r.spec.items.length}${r.spec.evidence?.length ? ` (+${r.evidence.length} of ${r.spec.evidence.length} evidence hadith)` : ''}`);
  console.log(decks.length ? decks.join('\n') : 'No authored decks yet.');
}

function main(argv) {
  const check = argv.includes('--check');
  const di = argv.indexOf('--deck');
  const deck = di >= 0 ? argv[di + 1] : null;
  if (deck !== null && !deckSpec(deck)) {
    console.error(`Unknown deck "${deck}". Known: ${Object.keys(DECKS).join(', ')}`);
    return 2;
  }
  if (deck === FIXTURE.id && !check) {
    console.error('The fixture deck is for tests only and is never emitted.');
    return 2;
  }
  const opts = { decks: deck ? [deck] : undefined, includeFixture: deck === FIXTURE.id };
  const res = check ? checkAll(ROOT, opts) : build(ROOT, opts);
  report(res);
  if (!check && res.written?.length) console.log(`Wrote ${res.written.length} file(s).`);
  return res.errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
