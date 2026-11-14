// Validates the hadith items under evidence/ with the same guardrails the deen build
// applies to a hadith deck (citation, grading, two witnesses, skeleton hashes, Arabic
// code points, translation length, glossary terms).
//
//   node content/deen/course/fasting/check-evidence.mjs
//
// scripts/build-deen.mjs reads a course unit's lessons/ only, so until the build learns
// about evidence/ (see HANDOFF.md) this script is how these items are checked. Lessons
// cite them as { "item": "course-fasting-evidence:<id>" }.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const { validateDeck, makeContext } = await import(pathToFileURL(join(root, 'scripts', 'build-deen.mjs')).href);

const DECK = 'course-fasting-evidence';
const dir = join(here, 'evidence');
const items = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: f.replace(/\.json$/, ''), data: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));

const res = validateDeck({ deck: DECK, kind: 'hadith', items, lock: { ids: {} } }, makeContext(root));
for (const w of res.warnings) console.log(`warn  ${w.code} ${w.id}: ${w.msg}`);
for (const e of res.errors) console.error(`ERROR ${e.code} ${e.id}: ${e.msg}`);

// Every evidence item a lesson cites must exist here and be source-checked
const ids = new Set(res.emitted.map((it) => it.id));
let missing = 0;
for (const f of readdirSync(join(here, 'lessons')).filter((n) => n.endsWith('.json'))) {
  const lesson = JSON.parse(readFileSync(join(here, 'lessons', f), 'utf8'));
  for (const c of lesson.claims ?? []) {
    for (const e of c.evidence ?? []) {
      if (typeof e.item !== 'string' || !e.item.startsWith(`${DECK}:`)) continue;
      if (!ids.has(e.item.slice(DECK.length + 1))) { console.error(`ERROR ${lesson.id}/${c.id}: cites ${e.item}, which is not a source-checked evidence item`); missing++; }
    }
  }
}
console.log(`${DECK}: ${res.emitted.length} of ${items.length} items pass`);
process.exit(res.errors.length || missing ? 1 : 0);
