# HANDOFF: course-fasting

Needs in shared files (spec section 9, rule 4). The package builds and passes without them.

## 1. Evidence hadith under `content/deen/course/<unit>/evidence/` are not built or emitted

- **What**: `scripts/build-deen.mjs` reads a course unit's `lessons/` only. The brief for the
  course content packages says to put a hadith that is not yet a corpus item under
  `content/deen/course/<unit>/evidence/` as a TextItem. Unit Fasting has three:
  `iftar-dhahaba-al-zama` (Abu Dawud 2357, with 2358 as a variant), `forgetful-eater`
  (al-Bukhari 1933) and `fasting-is-a-shield` (al-Bukhari 1894).
- **Where**: `scripts/build-deen.mjs` (`readDeck`, `knownItemIds`, `build`), and wherever the
  course lesson screen resolves `{ item: "<deck>:<itemId>" }` evidence
  (`src/components/course`, owned by course-ui).
- **Why**: lessons cite them as `{ "item": "course-fasting-evidence:<id>" }`. The build accepts
  that today only because `course-fasting-evidence` is not a registered deck, so the reference
  is not resolved and the items never reach `src/data/deen`. The lesson screen therefore
  has nothing to open for those three evidence chips.
- **Suggested change**: for a course deck, also read `evidence/*.json`, validate them as kind
  `hadith` (the package's `content/deen/course/fasting/check-evidence.mjs` already does this
  with `validateDeck` and passes), register `<deck>-evidence` ids in `knownItemIds`, and emit
  them, either as `src/data/deen/<deck>-evidence.json` or as an `evidence` array beside
  `items` in the course deck file. Then course-ui can show the citation, grading and Arabic.
- **Until then**: `guarding-the-tongue` and `iftar-dua` (lesson 6) state the hadith in the
  claim's own words with its attribution. `forgetting` (lesson 3) does not, to keep a claim
  about a difference neutral, so its evidence chip is the only place that hadith appears.

## 2. Iftar dua overlaps with adhkar-duas

- **What**: adhkar-duas is authoring the same iftar supplication in the `duas-daily` deck.
- **Why**: once it lands, lesson 6's `iftar-dua` claim could cite `duas-daily:<its id>` in
  place of the unit's own evidence item, so there is one copy of the Arabic. The id was not
  known when this package was written. A one-line change in
  `content/deen/course/fasting/lessons/fasting-06-recommended-acts.json` (raise `rev`).

## 3. `unit.json` shape

- **What**: the spec names `course/<unit>/unit.json` but not its fields, and the build does
  not emit it. This unit's file has `{ id, deck, order, title, blurb, lessons[], primers, footer }`,
  the same fields as course-purification's (`primers` maps each school to its fixed primer;
  `footer` is the closing line from STYLE.md, "For your own situation, ask a scholar you trust.").
- **Why**: the lesson JSON has no field for the closing line, so course-ui has to render
  `footer` (or its own constant) under every lesson. Lesson order is also carried by each
  lesson's own `order`.

## 4. A test file beside the deck module

- **What**: `src/content/deen/decks/course-fasting.test.ts` (added in review). vitest only
  picks up `src/**/*.test.ts`, so the unit's own checks cannot live under `content/`.
- **Why**: it runs the hadith guardrails on `evidence/*.json` (nothing else in CI reads that
  folder until need 1 lands) and checks the brief's counts. When need 1 lands, drop its last
  `describe` block in favour of the shared build check.
