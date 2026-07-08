# Ayah Segmentation by Waqf Marks — Design & Implementation Plan

*Drafted 2026-07-02. Status: Phases A + B implemented 2026-07-02 (src/lib/segments.ts + Understand deck);
C = pursue QUL word timestamps (owner chose; research pending), D implemented 2026-07-03
(word-budget lesson packing, owner accepted progress reset — old lessonIds orphaned harmlessly),
E deferred.*

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

### Phase C — RESOLVED 2026-07-03: QUL word timestamps (research verified)

Owner chose QUL timestamps over word-clip stitching. Research findings (5-agent verified run):
- **Word-level timestamps exist for 6 of our 10 reciters** via QUL's public API
  (`qul.tarteel.ai/api/v1/audio/ayah_segments/{id}?chapter=N`): Alafasy 18, Husary 20,
  Abdul Basit Murattal 15, Minshawy Murattal 24, Yasser Al-Dosari 26, Maher Al-Muaiqly 13.
- **The timestamps align to files byte-identical to our everyayah files** (MD5-verified for
  Alafasy/Minshawy/Yasser on 2:282; size-verified Husary/Abdul Basit) → no audio-source
  switch needed, EXCEPT Maher: QUL aligns to the 128kbps encode → switch his RECITERS id
  from `Maher_AlMuaiqly_64kbps` to `MaherAlMuaiqly128kbps` (exact dir name, no underscores).
- **No word data exists anywhere** for Nasser Al-Qatami, Hudhaify, Ahmed Al-Ajamy, Muhammad
  Jibreel (Qatami/Jibreel have surah-level ayah offsets only, word arrays empty — verified)
  → those fall back to full-ayah playback indefinitely.
- **Format**: rows `[word_1based, start_ms, end_ms]` relative to the per-ayah mp3 (live API
  sometimes 4-element `[seg_idx, word, start, end]`; malformed 1-element rows exist — parse
  defensively). Word numbering EXCLUDES the ayah-end marker = matches our `realWords`.
- **Chosen path**: one-time export → `public/segments/{everyayahDir}/{surah}.json` committed
  to the repo, lazy-loaded per surah; segment playback = seek/stop within the existing
  per-ayah audio (AudioController.playRange with ~100ms pre / ~150ms post padding, neighbor
  expansion for missing words). Deliberately NOT the live APIs: legacy quran.com API is
  unlabeled-gray-zone, and the new apis.quran.foundation ToS forbids caching >1 week
  (incompatible with offline-first).
- **Licensing**: attribute QUL/Tarteel + quran-align (Colin Fair, CC BY 4.0 — REQUIRED) +
  EveryAyah recordings; owner should email Tarteel to confirm terms for the 6 resources.
- Export + sampled audio-identity verification: `scripts/export-segments.mjs` (manifest at
  `public/segments/manifest.json`).

#### Segment-data status (updated 2026-07-08) — 5/6 reciters LIVE
- **Client code SHIPPED** (`1f41b98`): Build learns long ayahs part-by-part; playRange slices
  segment audio when `public/segments/{reciterDir}/{surah}.json` exists, else full-ayah
  fallback — the app is correct at every partial-data state.
- **Data imported via QUL bulk download** (owner's free account; the API-scraping path kept
  hitting throttling and is retired): `scripts/import-segments.mjs <downloads folder>`
  identifies reciters by the audio_url slug (filenames lie), validates word counts, and
  HEAD-verifies audio identity vs everyayah. Result: Alafasy, Abdul Basit, Minshawy, Yasser,
  Maher — full 6,236-ayah coverage each, 0 malformed, audio identity 12/12 sampled
  (Maher 41/42; his single differing ayah 5:20 was dropped → full-ayah fallback there).
- **Husary still pending:** the download labeled "husary murattal (955)" actually contains
  the MUALLIM edition (audio_url slug husaryMuallim) — importer refused it. Re-download the
  Murattal one (resource https://qul.tarteel.ai/resources/recitation/110; correct file's
  audio urls start audio-cdn.tarteel.ai/quran/husary/), then re-run the importer.
- QUL also offers segments for reciters not in Takrar (Sudais, Shatri, Hani ar-Rifai, ...);
  adding any of them later = add to RECITERS + SLUG_TO_DIR + import (audio via their QUL
  audio_url host if no everyayah mirror).
- **Remaining QA:** by-ear pass on ~20 sliced segments per reciter (incl. ayah-final words,
  which can carry trailing silence).
- **Licensing decision (owner, 2026-07-03):** no email to Tarteel (accepted small risk);
  attribution REQUIRED for quran-align (CC BY 4.0) shipped as a credit line in the Settings
  panel footer.

#### Original Phase C notes — RESHAPED (discovery 2026-07-02)
- `generateChunks`/`src/lib/chunks.ts` turned out to be DEAD CODE (never imported) — deleted.
  chunk-phase.tsx already learns ayah-by-ayah (6-4-4-6 + chaining) with FULL-AYAH audio, so the
  feared arbitrary 3-word chunks never actually ran. Test-phase blanks are quizzes, not taught
  stops — fine as-is.
- Making Build segment-aware therefore needs SEGMENT AUDIO: either stitched word-by-word clips
  (choppy) or timestamp slices of the full-ayah recording (QUL/Tarteel publish word-level
  timestamps for some reciters — data-sourcing task). Owner decision before building.
- Open pedagogy decision (owner) stands: for an over-long unmarked stretch, drill-only sub-split
  (always chained back, never shown as a stop) vs keep whole.

### Phase D — Load-weighted lessons — DONE 2026-07-03
- `scripts/generate-ayah-weights.mjs` → `src/data/ayah-weights.json` (per-ayah real-word
  counts, ~16KB static import; regenerate after any surah-data refresh).
- `curriculum.ts` packs lessons to a 45-word soft budget (max 5 ayahs; ≤8-ayah AND ≤60-word
  segments stay single lessons; ≤20-word orphan tails merge). A single over-budget ayah is
  its own lesson: 2:282 → "Ayahs 282–282"; Al-Baqarah ≈ 165 lessons (was ~58); Juz-30 short
  surahs pack like before. Owner accepted the lessonId renumbering (no migration; old saved
  lesson entries are orphaned but harmless).

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
