# HANDOFF: deen-engine

Requests for shared files (spec 9.4). The package builds and passes without any of them.

1. **scripts/build-deen.mjs: emit a merged registry.** Items cite collection, numbering,
   scholar and work ids. The trust components resolve them from the shared files in
   `content/deen/*.json` (`src/components/deen/registry-names.ts`), but a package's
   `registry-additions.json` sidecar is merged only inside the build script. An id that
   exists only in a sidecar therefore shows as a readable form of the id ("Ibn rajab").
   Ask: have `build()` also write `src/data/deen/registry.json` (the merged collections,
   numberings, scholars, works and reviewers, sidecars included); deen-engine then reads that
   file instead of the four shared ones (one import change in `registry-names.ts`).

2. **content/deen/ERRATA.md: entry format.** Cards whose item `rev` rose show "Text corrected
   on <date>" once. The date is read from ERRATA.md lines that hold an ISO date and the item
   as `<deck>:<itemId>`, for example
   `- 2026-12-01 · nawawi40:02 rev 2: a vowel on the third word fixed (found by …)`.
   Please add that example to the file's intro so content-audit writes entries this way.
   Without a matching line the card falls back to `review.date`, then to "Text corrected
   since you learned it."

3. **src/app/review/review-client.tsx: empty state when only deen cards exist.** With no Quran
   cards but some deen cards, the Review tab shows the full hero (large star, "Nothing to review
   yet", "Lessons you finish come back here", "Find a surah") and, below the middle of a 375px
   screen, a deen card saying "Start · 4 cards". It tells a new user there is nothing to review
   while something is waiting, and after a session "Nothing to review yet" sits above "All done
   for today". Ask: when `useDeenQueue().cardCount > 0`, drop the hero for one compact line at
   the top, for example `No Quran reviews yet. <Link href="/">Find a surah</Link>` (text-sm
   muted, the link teal and semibold, min-h-11), then `<DeenReviewSection/>` directly under it,
   so its Start button is the first thing seen. The hafiz copy works the same way ("No Quran
   reviews yet. Revise what I know"). Keep the full hero when `cardCount === 0`.

4. **e2e test seam (note, no change asked).** `e2e/deen-engine.spec.ts` builds the fixture
   deck with the real build script and hands it to the page through
   `window.__TAKRAR_TEST_DECKS__`, read only by `src/components/deen/deck-source.ts`.
   Nothing in the app sets it and no fixture data is bundled. Content packages can reuse it
   for their own fixture tests.

5. **Local builds in a worktree** (same as android-native): Turbopack refuses the
   `node_modules` junction, so build with `npx next build --webpack && node
   scripts/flatten-segments.mjs`, and with the CI placeholder Supabase env
   (`NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder`), or every page shows "This page couldn't
   load".

6. **src/components/ui/bottom-sheet.tsx: trap focus.** The sheet sets `aria-modal="true"` but
   Tab runs out of it onto the dimmed page. deen-engine traps focus inside its own term sheet
   (`FocusTrap` in `src/components/deen/term.tsx`, a document keydown handler cycling Tab and
   Shift+Tab through the dialog's focusable elements); every other sheet in the app has the same
   gap. Ask: do the same inside BottomSheet while `rendered` (or set `inert` on the app root while
   open), after which `FocusTrap` in term.tsx can be deleted.

7. **src/app/essentials/page.tsx: Learn tab copy.** The subtitle still says "Plans, guides, duas
   and dhikr" with no hadith or Names; suggest "Plans, guides, hadith, duas and the Names" once a
   deck is live (or simply "What to learn next"). The older "Duas, dhikr and key ayahs" heading now
   sits under the deen rows (renamed "Hadith, Names and more" to avoid the clash); when the adhkar
   deck goes live, suggest folding that section into the Adhkar and duas row or renaming it
   "Key duas and ayahs". The deen rows now use the same card style and `n/total` count as those
   collections, so the two sections read as one family.

## Contracts other packages use (src/components/deen, also re-exported from `index.ts`)

- `CitationLine({citation})`, `GradingLine({grading})`, `PositionsTable({positions, school})`,
  `Term({id, children})`, `RichText({text})`, `ReviewBadge({review})`,
  `ReportProblem({itemId, rev, title?})`, `MemoriseFlow({item, depth, onDone, kind?})`,
  `DepthChoice({title, onChoose})`, `useItemState(deck, itemId)`, `useDeckStates(deck)`.
- `learnHref(deck, itemId, depth?)` → `/review/deen?learn=<deck>:<id>[&depth=]`, a full-screen
  learn flow that returns to where it was opened from; `sessionHref(deck?)`.
- SELECTION.md: `/sources` lists the section whose heading contains "Not included" (any level)
  from every deck's SELECTION.md, read at build time.
