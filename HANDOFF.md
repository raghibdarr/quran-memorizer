# HANDOFF: android-native

1. **Push for the compile check (spec 9.6).** Push this branch as `mobile/allinone-native`
   (`git push origin aio/android-native:mobile/allinone-native`) to trigger `.github/workflows/android.yml`
   (assembleDebug). Merge only after that run is green. Nothing here was compiled locally (no JDK or Android SDK).
2. **Optional, `src/lib/native-plugins.ts` (foundations-owned):** add `prayerTz?: string` to
   `TakrarWidgetData` with the comment "IANA zone of the place, so the widget shows times as the app
   does". `widget-sync.tsx` already sends it through a local `WidgetPayload` type, so nothing breaks without it.
3. **Integration:** regenerate `public/licenses.txt` (picks up `data-sources/licenses.d/25-chime.txt`) and run
   `npx cap sync` (the new raw resource and the AdhanHealth plugin need no plugin-list change: they are app-local).
4. **Local builds in a worktree:** Turbopack refuses the `node_modules` junction ("points out of the filesystem root");
   `npx next build --webpack && node scripts/flatten-segments.mjs` works.

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

# HANDOFF: qibla

Needs in shared files (spec 9.4). The package builds and passes without them.

1. **`data-sources/README.md`** (foundations-owned), "All-in-one sources" table: add a row
   - Library/data: World Magnetic Model WMM2025 (NOAA NCEI and British Geological Survey), coefficients pinned in `data-sources/wmm/` (see its SOURCE.md)
   - Used for: correcting Android's magnetic compass heading to true north on the qibla screen, on the device
   - Licence / terms: public domain (US government work); credited
   - Fragment: `licenses.d/30-wmm.txt`

   Why: every all-in-one source is recorded in the README as well as in its SOURCE.md and fragment.

2. **Integration**: regenerate `public/licenses.txt` so `licenses.d/30-wmm.txt` is included.

# HANDOFF: prayer-alerts

Nothing in a shared file is required for this package to build or pass. Two notes for the orchestrator:

1. **Existing hifz reminders and exact alarms (`src/lib/reminder-notifications.ts`, not owned here).**
   `@capacitor/local-notifications` 8.3 defaults `isExactNotification` to `true`. On Android 12+ without the
   exact-alarm grant, `schedule()` then opens the system "Alarms and reminders" screen on every call.
   Once android-native declares `SCHEDULE_EXACT_ALARM`, `applyReminders` would do that on every app open for a
   user who hasn't granted it. Suggested fix (one line in the notification object):
   `isExactNotification: false` (a daily nudge doesn't need the minute). Prayer alerts already set it from
   `checkExactNotificationSetting()`, so they never open the screen by themselves.

2. **Notification taps.** Prayer alerts carry `extra.url` (`/prayer`, the test alert `/prayer/alerts`).
   ReminderSync's existing `onReminderTap` listener routes any notification with an `extra.url`, so
   PrayerSync adds no second listener. If ReminderSync ever stops being mounted app-wide, move that listener.

Local builds in this worktree: Turbopack refuses the `node_modules` junction, so `npx next build --webpack`
(with placeholder `NEXT_PUBLIC_SUPABASE_*` values; without them the static pages throw on load).

## Review pass (fresh reviewer)

3. **"Erase everything on this device" (`src/components/layout/erase-device.tsx`, not owned here)** wipes
   localStorage but not the alarms the OS holds. PrayerSync now looks once per app run and clears left-behind
   prayer alerts (ids 20000-21000), so nothing is needed there for prayer; other features that schedule
   (adhkar 22000+, reminders 22100+) need their own clean-up or a `LocalNotifications.cancel` in the erase flow.
4. **Churn.** A plan drops each alert as it passes, so its hash changes after every prayer and the next open
   cancels and re-sets the whole range (about 150-310 alarms on Android). Correct, but if it shows up as lag on
   a slow phone, `applyRange` (foundations) could diff by id instead of replacing the range.
5. **Delivered alerts pile up in the tray** (each has its own id; a heads-up stays beside its prayer). Possible
   follow-up: `removeDeliveredNotifications` for older prayer ids on app open.

## Second review pass

6. **Engine oddities near the polar circles (`src/lib/prayer/engine.ts`, foundations, not owned here).** With
   `highLatRule: 'auto'` at Longyearbyen (78.22, 15.65): on 2027-02-18 `computeDay` returns Asr on 22 Feb
   (four days away); on 2026-10-20 and 2026-11-01 Asr comes out before Dhuhr; through the polar night
   (Jan to mid Feb) Asr comes out after Maghrib. The planner now leaves out any time more than a day from its
   own day (no alert rather than a wrong one), but the out-of-order Asr still reaches the times screen and the
   alerts. Suggested fix in the engine: return null for Asr when it is not between Dhuhr and Maghrib.
7. **The test alert shares the prayer range** (id 20019), so a replan used to cancel it. The glue now puts a
   still-waiting test alert back after a replan. On iOS with every other range full it is briefly a 65th
   pending notification; the furthest one is dropped by iOS until the next replan (unverified on device).

## UX/UI pass

8. **No button to Takrar's notification settings.** When notifications are off for Takrar the screen now says so
   at the top on every visit (from the probed permission, not just a failed ask) and names where to go, but
   there is no "Open settings" button: neither `@capacitor/local-notifications` nor the spec's `AdhanHealth`
   contract can open the app's notification screen. Suggested for android-native: an
   `AdhanHealth.openNotificationSettings()` (Android `Settings.ACTION_APP_NOTIFICATION_SETTINGS`; iOS
   `UIApplication.openSettingsURLString`), then a button on the notice and the Notifications row.
9. **Icons kept local.** The bell and the "needs attention" circle live in
   `src/components/prayer/alerts/alert-icons.tsx`, since `src/components/ui/icons.tsx` is foundations-only.
   Integration can move them into the shared set.

# HANDOFF: mosques

Mosque finder (`/mosques`) from OpenStreetMap country packs. No shared files edited apart from
replacing the foundations stub `src/app/mosques/page.tsx`.

1. **Tile flag (`src/lib/prayer/tools.ts`, spec 3.8): keep `mosques` at `ready: true`.** The full
   worldwide build succeeded on 2026-11-14: 187 country packs, 216,193 mosques, 7,785,947 bytes
   (under the 8 MB budget). **Indonesia (ID) is not covered**: its list alone is 74,301 mosques /
   2.46 MB and does not fit with the rest. A place in Indonesia sees "We don't have a mosque list for
   Indonesia yet" with a "Change place" button (to `/prayer/settings`). To add it, either raise the budget (`--budget 10.5`) or make the
   format smaller; the owner should decide. Every other country with OSM mosques is covered
   (see `data-sources/osm-mosques/SOURCE.md` for the per-file list, counts and sha256).

2. **Service worker:** nothing to do. Foundations' `public/sw.js` already caches `/data/*`
   (stale-while-revalidate into `takrar-data-v1`), and the native apps carry `out/data/mosques/`
   in the bundle.

3. **Size:** `out/data/mosques/` is 7.79 MB; the `/mosques` page chunk is 40 KB (it carries the
   5.9 KB pack index so the screen can show the size without a request). `scripts/check-bundle.mjs`:
   Home +2.2 KB gzipped, out/ +5.97 MB against the 2026-11-13 baseline, OK.

4. **Licences:** `data-sources/licenses.d/40-osm.txt` (ODbL attribution, Natural Earth used only at
   build time). The screen shows "Data © OpenStreetMap contributors (ODbL)" linking to
   openstreetmap.org/copyright.

5. **Rebuilding the data** (maintainers only, never from the app):
   `node scripts/build-mosques.mjs` (one worldwide Overpass query, cached in the OS temp dir);
   `--check` verifies packs, index and SOURCE.md offline. If Overpass can't answer the worldwide
   query, `--per-country GB,US,...` asks one country at a time.

6. **e2e:** `e2e/mosques.spec.ts` (seeded London place lists the nearest UK mosques; a request
   listener proves the tap makes exactly one GET, `/data/mosques/GB.json`, with no coordinates;
   no place links to `/prayer/setup`; an uncovered country shows the empty state and loads
   nothing). It was not run against the repo's Playwright configs (reserved for integration);
   the same flow was checked with an ad-hoc script on port 4418 (light and dark, 375 px, no page
   errors, no horizontal scroll).

7. **Local builds in this worktree:** Turbopack refuses the `node_modules` junction; use
   `npx next build --webpack && node scripts/flatten-segments.mjs` with placeholder
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

8. **Review notes (2026-11-14):**
   - "Open in Maps" (the whole row is the link): `geo:` on Android, `maps://` on iPhone, iPad and
     Mac, and on other desktop browsers (Windows, Linux, which have no `geo:` handler) the mosque
     on openstreetmap.org in a new tab with `rel="noopener noreferrer"`. The link carries only the
     mosque's own position and is followed only on a tap; the app still draws no tiles. If the owner
     prefers no web link-out at all, change the `'web'` branch of `mapsHref` in
     `src/lib/mosques/links.ts`.
   - Indonesia is the largest list and is the one left out (item 1). Fitting it needs about 2.3 MB
     saved or a bigger budget; a denser pack format (integer, delta-coded positions) gets roughly
     2 MB, not quite enough on its own.
   - Small lists (under 500 KB, every country but Türkiye, Iran and Bangladesh; all of them in the
     native apps, where the files are in the bundle) load as the screen opens. The three big ones
     keep the "Mosques near <place>" card with the size and a "Show mosques" button.
   - Rows under 1 km (1 mile in miles countries) say "Under 1 km" with no direction: the place is
     rounded to about a kilometre, so closer than that neither means much.
   - The e2e "only data request" check uses GB, whose nearest rows have no `name:ar`. A row with an
     Arabic name makes the page fetch the app's own Arabic font files (same origin, no position);
     keep that in mind if the test's country changes.

9. **Integration gate (UX review, 2026-11-14):** in this worktree `/prayer/setup` is still the
   foundations stub, so a first-time user's only action ("Set your place") is a dead end. After
   merging prayer-times, drive first run -> setup -> (allow location / deny / choose a city) ->
   back to `/mosques` and confirm the list shows. If setup ships later than this package, set
   `mosques` to `ready: false` in `src/lib/prayer/tools.ts` (foundations' file) until it does.
   A place with no country code (possible for a GPS place) gets "We couldn't tell which country
   you're in" with "Choose a city" (to `/prayer/setup`).

# HANDOFF: zakat

Requests for the orchestrator or integration. The package builds and passes without any of them.

1. **Shared reminders range (22100-22109).** The hawl reminder calls `applyRange(NOTIFY_RANGES.reminders, …)` with id 22100. `applyRange` cancels everything pending in a range, so if another package later schedules fasting reminders in the same range with its own `applyRange` call, the two will cancel each other. Fix before that lands: either split the range in `src/lib/notify/registry.ts` (for example `hawl: 22100-22101`, `fasting: 22102-22109`, iOS slots 1 and 3), or have one planner own the whole range. Today only zakat uses it.
2. **Yearly re-arm (optional).** The reminder is scheduled from the `/zakat` screen (on open and on every change). After it fires, next year's reminder is scheduled the next time the user opens `/zakat`. If the owner wants it re-armed without opening the screen, mount a tiny sync (`syncHawlReminder` from `src/lib/zakat/reminder.ts`, reading `useZakatStore` and `usePrayerStore.hijriOffset`) in `providers.tsx`.
3. **Licensing.** Nothing new: the zakat notes are our own work and there is no data source. No `licenses.d` fragment.
4. **Build note.** `npm run build` (Turbopack) fails in this worktree only because `node_modules` is a junction outside the worktree ("Symlink … points out of the filesystem root"). `npx next build --webpack` builds fine. This is the worktree setup, not the package.
5. **Review notes (fresh reviewer).**
   - A static build in a worktree without `.env.local` crashes every page at runtime with "supabaseUrl is required" (the page shows "This page couldn't load"). For local browser checks build with placeholder `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Integration should build with the real env.
   - `zakat-store` defaults `nisabBasis` to `'silver'` (foundations contract), so the headline is on the silver basis until the user switches. Both bases are always shown side by side and the basis note names the difference, but the owner may prefer no basis preselected; that needs a store change (`nisabBasis: NisabBasis | null`).
   - Content for the audit pass: done, see 6.
6. **Content check (independent verifier, 2026-11-14).** The package ships no hadith text, dua or Arabic for display; its religious content is the eleven notes in `src/data/zakat-notes.json`. Each was checked against fetched Arabic, and the located phrase is now stored in `evidence[].quote` (a script confirmed every quote is a substring of the fetched text).
   - Witnesses read: Mukhtasar al-Quduri, al-Risala of Ibn Abi Zayd, Matn Abi Shuja', 'Umdat al-Fiqh, al-Nawawi's Minhaj al-Talibin, Kifayat al-Akhyar, al-'Udda, Ibn al-Mundhir's al-Ijma' (all shamela.ws); Bidayat al-Mujtahid, Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud (ar.wikisource.org); Sunan Ibn Majah (shamela.ws); al-Durar al-Saniyya fiqh encyclopedia; Darul Ifta Birmingham; IslamOnline fiqh; IslamQA (quoting Ibn Hazm).
   - Corrected: `nisab-metals` presented twenty mithqal of gold as agreed. Ibn Rushd says "most scholars" and records al-Hasan al-Basri and others who set it differently; Ibn al-Mundhir's consensus is conditional on the gold being worth 200 dirhams. The note now says "in all four schools" and names the dissent.
   - Corrected: `debts` grouped the Maliki school with "taken off first". The Risala sets the debt against non-zakatable belongings first; it now has its own position. The Hanafi and Hanbali lines now follow their primers' wording.
   - Corrected: `hawl-dip` gave "Shafi'i, Hanbali: nisab through the whole year" for all wealth. The Minhaj measures goods for sale at the end of the year only (the relied-upon view), and 'Umdat al-Fiqh states the whole-year rule for goods for sale only; each school now says what its source says. The Maliki position could not be confirmed in the primer and is named as not shown.
   - Corrected: `combining` showed two schools; the Maliki (Risala) and Hanbali ('Umda, as far as it goes) positions are added. Matn Abi Shuja' is silent, so the Shafi'i line rests on Ibn Rushd alone and the note stays `draft`.
   - Corrected: `rate` said the year passes "with your wealth at or above nisab", which is one side of the `hawl-dip` difference; reworded.
   - Removed (could not verify): every citation of al-Qaradawi's Fiqh al-Zakah (text not reachable), and the claims "many zakat bodies use 85 g / silver". The 85 g and 595 g figures are now attributed to Ibn 'Uthaymin as quoted by al-Durar al-Saniyya; the gold-basis reasoning follows the IslamOnline answer that was read.
   - Status: `rate`, `nisab-metals`, `worn-jewellery`, `debts`, `trade-goods`, `receivables`, `hawl`, `hawl-dip` are `source-checked`; `nisab-grams`, `basis`, `combining` stay `draft` (modern figures with one fetched witness each, or a single witness for one school). Nothing is scholar-reviewed. For the Shafi'i school, `debts` and `hawl-dip` cite the Minhaj and Kifayat al-Akhyar because the spec's named primer does not address them.
   - `scripts/build-deen.mjs --check` passes ("No authored decks yet": this package authors no deck). `content/deen/ERRATA.md` is untouched: nothing here had shipped, and the file is shared.

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

# HANDOFF: course-ui

Needs in shared files (spec section 9, rule 4). The package builds and passes without them.

## 1. Emit a course unit's evidence hadith beside its lessons (pairs with course-fasting need 1)

- **What**: in `scripts/build-deen.mjs`, for a course deck, also read
  `content/deen/course/<unit>/evidence/*.json`, validate them as hadith items (all guardrails,
  only `source-checked` or better), add their ids as `<deck>-evidence:<id>` to the known item
  ids, and emit them as an `evidence` array beside `items` in `src/data/deen/<deck>.json`
  (and add `evidence?: TextItem[]` to `EmittedDeck` in `src/types/deen.ts`).
- **Why**: Unit Fasting cites three hadith as `{ "item": "course-fasting-evidence:<id>" }`.
  The lesson screen already resolves that form: it looks the ref up as a live corpus item first
  and then in the course deck's `evidence` array (`resolveEvidenceItem` in
  `src/components/course/course-data.ts`, tested end to end with the fixture unit). Until the
  build emits them, those three chips say "This hadith's text and reference aren't in the app
  yet." (lesson 3's `forgetting` claim has no other mention of its hadith).
- **No course-ui change needed** once the build emits the array; drafts are filtered out again
  on screen.

## 2. Local builds in this worktree

Turbopack refuses the `node_modules` junction; `npx next build --webpack` with placeholder
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then
`node scripts/flatten-segments.mjs`.

## 3. UX/UI pass: asks for other packages (course-ui could not change these)

- **deen-engine, `src/components/deen/positions-table.tsx`**: the primer source button under each
  position is the only way to the Arabic quote, and it is a 12px line about 16px tall (32px when it
  wraps), well under the 44px touch target. Ask: give the button `min-h-11` with vertical padding,
  or `py-3 -my-3` so the hit area grows without moving the layout. Applies everywhere the table is used.
- **foundations, `src/lib/deen/load.ts`**: `loadDeckModule` and `loadDeck` cache a failed download as
  `null` for the life of the page, so no in-page retry can reach the network again. The course
  screens now tell a failed load apart from "not ready" (a registry course deck whose module or
  content didn't load) and show "The lessons couldn't be loaded" with Try again, which reloads the
  page. Ask: drop the cache entry when a load throws, so screens can retry without a reload.
- **course-purification** (content): in water-01's third question, drop the stray commas:
  "Hunger and thirst", "Travel and illness", "A ritual state and physical impurity" (raise `rev`).
- **course-purification / course-fasting** (content): a few claims are long procedures in one
  semicolon-separated sentence (wudu-02 point 2 is 351 characters, fasting-06 `iftar-dua` 358).
  The player now sets claims over 140 characters in regular weight so they read as a paragraph,
  but they would read better split into shorter claims. If a numbered-steps form is wanted, it
  needs a `steps?: string[]` field on `Claim` in `src/types/deen.ts` (foundations) first; the
  player would render it as a numbered list.
- **Evidence hadith (need 1 above)**: until the build emits them, the three Unit Fasting hadith
  show as a plain "Hadith · reference to come" note, not a chip that opens to nothing.
  `src/lib/course/evidence-refs.test.ts` fails if any other cited hadith does not resolve, and
  fails again once one of these three resolves, so the waiting list is taken down when need 1 lands.
