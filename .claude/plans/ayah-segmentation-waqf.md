# Ayah Segmentation by Waqf Marks — Design & Implementation Plan

*Drafted 2026-07-02. Status: agreed in principle, not yet implemented.*

## The three problems this solves

1. **Giant deck cards** — long ayahs (worst case 2:282, 128 words) render as an absurdly tall card
   in the Understand deck, with a 128-tile word bank below it.
2. **Arbitrary Build/Test chunks** — `src/lib/chunks.ts` splits ayahs into ~3-word chunks by count
   alone, which cuts mid-phrase and can teach a *waqf qabīḥ* (meaning-distorting stop).
3. **Unweighted lessons** — lessons are split by ayah *count*, so a 5-long-ayah lesson (e.g. 2:282's
   lesson 2/56) is many times the memorization load of a 5-short-ayah lesson.

## Research foundation (deep-research run, 2026-07-02; 23 sources, 22/25 claims verified)

- Waqf quality taxonomy (al-Dānī, rooted in Ibn al-Anbārī's *al-Īḍāḥ*): **tāmm / kāfī / ḥasan**
  are permissible stops; **qabīḥ** (stopping on an incomplete structure — inside iḍāfa, between
  subject–predicate, verb–object, across conjunction, after inna, on a relative pronoun, before
  illā) is forbidden. A blind word-count split lands on qabīḥ boundaries → **never fall back to
  word-count splits for recitation boundaries.**
- **The printed muṣḥaf pause marks are the scholarly curation.** Medina muṣḥaf six-mark system,
  already embedded in our Uthmani text data.
- **Stop-safe ≠ start-safe** (ibtidāʾ rules): a point safe to stop on may be unsafe to *start*
  from (e.g. stop on "al-ḥamdu lillāh", must not start at "rabbi l-ʿālamīn"). Printed marks are
  routinely-resumed-from stops by design, so mark-based boundaries largely sidestep this; the
  danger case is invented (unmarked) boundaries — which we refuse to create.
- **No curated whole-Quran phrase dataset exists** beyond the printed marks (checked Tarteel QUL,
  Quranic Arabic Corpus, Tanzil). Marks are sparse and ijtihādī (scholarly judgment, edition-varying);
  we standardize on the Medina set our data already carries.
- Waqf iḍṭirārī (forced stop): permissible out of necessity; resume by going back, not forward.
  Supports "drill fragments are OK as long as final recitation is chained from a proper start."

## Licensing notes (verified)

- **Quranic Arabic Corpus (corpus.quran.com): GPL v3** (verified on license.jsp 2026-07-02).
  Copyleft — a boundary dataset derived from its treebank must itself be GPL/open. Acceptable path
  if we ever need tier 3: publish the derived boundary list as an open dataset with attribution.
  Decision deferred.
- **Tanzil text: verbatim-only license** — may not modify the text itself. Segmentation must be
  stored as an **overlay** (word-index ranges), never by editing text. (Our engine operates on the
  `words[]` arrays and outputs index ranges, so this is satisfied by construction.)

## Pause-mark reference (as found in our surah JSON `textUthmani`)

| Char | Unicode | Name | Meaning | Treatment |
|------|---------|------|---------|-----------|
| ۚ | U+06DA | jeem (jāʾiz) | stop/continue equally fine | **primary split point** |
| ۗ | U+06D7 | qaf-lam (qalā) | stop preferred | **primary split point** |
| ۘ | U+06D8 | meem (lāzim) | compulsory stop | **primary split point** |
| ۖ | U+06D6 | sad-lam (ṣalā) | continue preferred (stop permitted) | **secondary** — use only to break an over-long segment |
| ۙ | U+06D9 | lām-alif (lā) | forbidden stop | **never split** |
| ۛ | U+06DB | muʿānaqah (paired dots) | stop at ONE of the pair, not both | split at at most one of the pair (prefer first) |
| ۜ | U+06DC | seen (sakta) | breathless micro-pause | **never split** |

Also strip/ignore rub-el-hizb ۞ (U+06DE) and sajdah ۩ (U+06E9) — layout marks, not words
(the existing `NON_WORD_MARK` regex in understand-phase.tsx already handles these for tajweed splitting).

## The safety rule (agreed)

**Split only at printed marks. Where no usable mark exists, keep the stretch whole — never invent
a stop.** Tiered:

1. **Tier 1 (ship now):** split at ۚ ۗ ۘ; respect ۙ/ۜ as non-boundaries; muʿānaqah = one of pair.
2. **Tier 2 (ship now):** over-long segment with a ۖ inside → allow split there. Still too long
   with no mark at all → **keep whole** (card scrolls / chunk stays big but on real boundaries).
3. **Tier 3 (future, pending GPL decision):** grammar-computed kāfī boundaries from the Corpus
   treebank for unmarked long stretches. Both edges must validate (stop-safe AND start-safe).

Validation data point: 2:282 has 16 marks → 17 segments (sizes 2–17 words); 2:255 → 9 segments (3–8 words).

## Implementation phases

### Phase A — `segmentAyah` engine (`src/lib/segments.ts`)
- Input: `Ayah` (words[] + textUthmani). Output: `Segment[]` = word-index ranges + the mark that
  ends each segment (for display) + segment transliteration/translation slices if derivable.
- Rules per the table above; threshold constant (only segment ayahs > ~25–30 words — tune by eye).
- Pure function + unit-testable; validate across all 114 surahs (no empty segments, ranges cover
  all words exactly once, never splits at ۙ).
- **First deliverable: a printout of 2:282, 2:255, and a few mid-length ayahs' segments for
  owner sign-off before any UI wiring.**

### Phase B — Understand deck segment cards
- Deck items become segments (short ayah = 1 segment = identical to today).
- Counter: "Ayah 282 · part 3 of 17" (pill already exists); word tiles + meaning plaque scoped to
  the current segment (fixes the 128-tile grid).
- Show the ending pause-mark glyph on each segment card (teaches the mark system).
- `exploredAyahs` gating: an ayah counts as explored when all its segments were visited.
- Keep the new stacked-deck visuals (uniform size, depleting stack, single grounding shadow).

### Phase C — Build/Test chunks from segments
- Replace `generateChunks` word-count logic with segments (keep the existing chaining:
  1 → 1+2 → 1+2+3 …).
- Open pedagogy decision (owner): inside an over-long unmarked segment, allow *drill-only*
  word-split (always chained back, never shown as a stop), or keep whole. Test on real long
  ayahs before deciding.

### Phase D — Load-weighted lessons
- Weight ayahs by segment/word count; pack lessons to a target load instead of ayah count
  (2:282 becomes its own lesson). Floor so tiny lessons don't occur. Touches lesson-def
  generation + plan math (`src/lib/plan*`); migration concern: existing lessonIds are
  "surah-lessonNumber" — renumbering affects saved progress/plans, needs a migration or
  versioned lesson map.

### Phase E (future) — Tier-3 grammar boundaries
- Corpus treebank → compute kāfī boundaries inside unmarked stretches; both-edge validation.
- Blocked on: GPL v3 decision (open-source the derived boundary data, or skip).

## Open decisions for the owner
- [ ] Segment threshold (~25–30 words?) — tune visually.
- [ ] Phase C drill-only sub-split: allow or keep-whole?
- [ ] Phase D lesson renumbering/migration approach.
- [ ] Tier 3: pursue GPL-open boundary dataset, or stay marks-only?

## Interim band-aid (optional, independent)
- Cap Understand card max-height with internal scroll so 2:282 is usable before Phase B lands.
