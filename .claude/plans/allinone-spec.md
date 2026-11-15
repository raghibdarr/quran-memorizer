# Takrar all-in-one: merged build spec

Integration status (2026-11-15): all 17 packages merged on branch `allinone`; every deck and every Prayer tool is live (no `ready: false`); full gate green (see HANDOFF.md for owner follow-ups and device checks). Android not yet compiled in CI.

Status: approved design for parallel build. Written 2026-11-13 by the judge pass over three independent designs (experience lens = D1, engineering lens = D2, content lens = D3). Source roadmap: `Downloads/reports/All in one Muslim app roadmap.md` (Phase 1 parity, Phase 2 differentiators). Every build agent reads this file plus its own brief.

## 0. Judgement of the three designs

| Design | Score | Strongest | Weakest |
|---|---|---|---|
| D1 experience | 7.5 | IA, flows, permission-at-point-of-use, calm rules, flat query-param routes, stub-and-slot pattern, Ramadan timing | thin content pipeline; synced prayer log; F0 edits the Android manifest; 17 packages; several packages share data files |
| D2 engineering | 8.5 | verified repo seams (isAppRoute, five sync registration points, fixtures tests), notification ID registry and iOS 64 budget, hash-skipped rescheduling, single native writer with CI compile check, bundle check, licence fragments, ids lock | bundles a third-party hadith Arabic dump whose upstream is unclear; dynamic `[id]` routes over empty decks; engine shipped as signature only, forcing an extra wave |
| D3 content | 8.0 | provenance rules, two-witness collation, attributed gradings, positions as data, one file per item, staged pipeline with fresh checkers, build-enforced guardrails, honest 99 Names and iftar-dua stance, errata | overloads foundations (session player, cities); settings-section registry; synced prayer settings; citation numbers are from memory (it says so) |

Conflicts resolved (grafts marked):

1. **Fifth tab "Prayer"**: all three agree. Adopted.
2. **Routes**: flat static pages with query params for detail screens (D1), every one listed in `isAppRoute` (D2). No new dynamic segments, so empty decks cannot break the export.
3. **Prayer engine and Hijri conversion live in foundations, fully implemented** (D1, D3), not signature-only (D2). This lets almost everything build in wave 1.
4. **Privacy of stores**: strictest reading wins. Place is device-only and excluded from backup (all three). Prayer settings are device-only too (D2), because a method choice hints at region; they ride in the backup file without coordinates. Prayer and fasting logs are device-only and in the backup file (D3); opt-in sync (D2) is deferred as an owner decision. Only the learning store syncs.
5. **Hadith Arabic**: D3's rule wins over D2's. Nothing is bulk-bundled from `fawazahmed0/hadith-api` or any Sunnah.com-derived dump. Arabic is collated per item against two witnesses. From D2 we keep the idea of a mechanical check: each witness records the sha256 of the normalised skeleton the collator saw, and the build verifies the shipped Arabic hashes to the same value. Quran text is never stored, only referenced (D2 and D3).
6. **Gradings**: D3's ordered preference (the two Sahihs, verdicts inside classical works, then modern verdicts attributed by name and work), with D2's caution kept as a rule: a verdict that cannot be located is deleted, never softened.
7. **Course scope**: Units Purification and Fasting ship now (fasting serves Ramadan 1448, expected about 8 February 2027, D1). Unit Prayer waits for the first content audit (it is the largest and riskiest unit). D2's owner off-switch `SHOW_UNREVIEWED_FIQH` is kept.
8. **Settings**: one link row in the settings sheet (D1, D2). No registry of settings sections (D3 dropped).
9. **Emitted content**: authored one file per item (D3), emitted per deck so each package commits only its own emitted file (fixes D3's shared `index.json`), ids locked per deck (D2).
10. **Exact alarms**: the manifest change is made only by the native package on a `mobile/` branch (D2), not by foundations (D1). It reverses an earlier owner decision and is flagged in section 12.
11. **Tasbih counts** reuse the existing synced `quran-essentials` counters (D3); no second counter store.
12. **Review tab badge** stays Quran-only (D2, D3). Deen cards never gate "day complete".

## 1. Product principles

1. Free forever, no ads, nothing gated, no upsell. Offline-first.
2. Hifz stays the home. Home gains at most one slim strip, shown only after the user sets a place.
3. Location never leaves the device. Prayer maths is on-device (adhan-js). Coordinates are rounded to 2 decimal places, stored in one device-only store, absent from sync, backup, URLs, analytics and every network request. A manual city choice needs no permission and is equally prominent.
4. Permissions at the point of use: location on "Use my location", notifications on "Notify me", motion on opening Qibla. Coarse location only. Nothing is asked at first run.
5. One review queue. Hadith, adhkar, Names and course cards appear in the Review tab beside Quran reviews, using the existing SM-2 core and self-rating. No article dumps.
6. Calm. No streak shaming, no red, no "missed" counts on tabs, no notifications about missed worship. Pause needs no reason. One primary action per screen. Tactile treatment only on the next-prayer hero, the tasbih button and primary actions.
7. Nothing religious is free prose. Each religious statement is a structured item that cannot pass the build without citation, attributed grading (hadith), and review status. Disagreement between the four Sunni schools is data, shown without picking a winner. No rulings invented. Lesson footer: "For your own situation, ask a scholar you trust."
8. Honest status. Every item shows "Source-checked. Not yet reviewed by a scholar." until a named reviewer is added; adding one is a data change only.
9. No runtime AI. AI exists only in the authoring pipeline.
10. Every data source is openly licensed or our own work, recorded before it ships.

## 2. Information architecture

### 2.1 Bottom nav (5 tabs)

Home `/` · Review `/review` · **Prayer `/prayer`** · Learn `/essentials` · Progress `/progress`.

- Prayer `also`: `/qibla`, `/tasbih`, `/calendar`, `/ramadan`, `/zakat`, `/mosques`.
- Learn `also` (existing `/plans`, `/blog` plus): `/hadith`, `/adhkar`, `/names`, `/course`, `/glossary`, `/sources`.
- New `PrayerIcon` in `src/components/ui/icons.tsx`. Verify pill width and the slide animation at 375px.

### 2.2 Route map (all static client pages; detail via query params)

| Route | Owner package | What the user sees |
|---|---|---|
| `/prayer` | prayer-times | Hijri line, next-prayer hero with countdown, six rows (Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha) each with a tracker tick, at most one contextual chip (Ramadan banner, else adhkar-now), tool tiles. Before setup: one setup card |
| `/prayer/setup` | prayer-times | 3 steps: place; method and Asr position (pre-chosen by region, explained); alerts |
| `/prayer/settings` | prayer-times | place, method, Asr, high-latitude rule, per-prayer offsets, Hijri day offset, Home strip toggle, links to alerts, match and why |
| `/prayer/why` | prayer-times | plain explainer of why times differ |
| `/prayer/match` | match-mosque | Match my mosque wizard |
| `/prayer/alerts` | prayer-alerts | per-prayer alert mode, health check, test alert |
| `/prayer/tracker` | worship-tracking | month of dots, pause, make-up list |
| `/tasbih` | worship-tracking | counter; `?d=<essentials or deen item id>` binds a dhikr |
| `/qibla` | qibla | compass, calibration hint, no-sensor fallback |
| `/calendar` | hijri-ramadan | Hijri month grid, expected events, sighting explainer |
| `/ramadan` | hijri-ramadan | suhoor and iftar countdown, fasting log, make-up fasts, khatm link |
| `/zakat` | zakat | calculator, nisab positions, hawl date |
| `/mosques` | mosques | country pack, list by distance and bearing, Open in Maps |
| `/review/deen` | deen-engine | session player for all decks, `?deck=` optional |
| `/glossary`, `/sources` | deen-engine | all terms; method, scope, reviewers, errata, not-included list |
| `/hadith`, `/hadith/view?id=` | hadith-nawawi40 | list with per-item state; detail |
| `/adhkar`, `/adhkar/view?d=`, `/adhkar/now?set=` | adhkar-duas | deck index, deck list, Pray it now |
| `/names` | names99 | the Names with intro card |
| `/course`, `/course/lesson?l=` | course-ui | lesson list, micro-lesson |

Foundations creates every route as a stub page (`<StubPage title>` with BackButton and BottomNav) and adds all of them to `isAppRoute` with tests. A package replaces only its own `page.tsx` and adds client components under its own folders.

### 2.3 Home

One `HomePrayerStrip` under the header: "Asr 15:12 · in 1 h 4 min" (in Ramadan: "Iftar 16:31 · in 2 h"). Renders nothing until a place exists. Tap goes to `/prayer`. The engine is dynamically imported so Home's first-load JS is unchanged for users without a place (enforced by `scripts/check-bundle.mjs`).

### 2.4 Learn hub (`/essentials`)

Order: `<LearnRows/>` slot (registry-driven: Hadith, Adhkar and duas, Names of Allah, Foundations course; decks with `ready: false` are hidden) → Memorisation plans → Guides → Duas, dhikr and key ayahs (existing).

### 2.5 Review tab

`<DeenReviewSection/>` slot under the Quran streams: "Hadith, duas and Names" with per-deck due counts and its own Start button to `/review/deen`. Caps: 20 reviews and `newPerDay` (default 5) new cards per day.

### 2.6 Settings sheet

One new row: "Prayer times and alerts" → `/prayer/settings`. Nothing else edits `settings-panel.tsx`.

### 2.7 Key flows

- **Prayer setup**: card "Prayer times, worked out on your phone. Your location is never sent anywhere." → "Use my location" (OS prompt, coarse, one fix, rounded, label from nearest bundled city) or "Choose a city" (offline search). Confirm place, method (one sentence why), Asr: "Standard (Shafi'i, Maliki, Hanbali)" or "Hanafi". Then "Tell me when each prayer starts?". Denied location falls straight to the city picker. If the device timezone later differs from the place's, a dismissible line offers "Update location?". No background location.
- **Match my mosque**: user types start times (not jama'ah; the copy says so) for one or two dates; app fits method, Asr, high-latitude rule and per-prayer offsets; shows before/after; Apply and Undo.
- **Tracker**: tap a passed prayer = prayed (on time if before the next prayer starts, else late); long-press: On time / Late / Missed / Clear. Pause excludes days from all counts.
- **Learning an item**: Read (Arabic, our translation, citation, grading, tap-to-define) → Build (segment by segment with hide-words from `first-letters.ts`, then chained) → Recall and self-rate (`RatingButtons`) → cards enter the queue. Depth per deck: "Know the meaning" or "Memorise the Arabic" (defaults: Names = meaning, adhkar = Arabic, hadith = ask).
- **Pray it now**: `/prayer` shows "After Dhuhr adhkar" once that prayer's time has entered; morning set from Fajr to sunrise, evening set from Asr to Maghrib. Walks the set with tap counters. Not rated, no streak.

## 3. Shared foundations (package `foundations`, wave 0, alone)

Foundations is the only package that edits the shared files listed in 3.8. It leaves the app looking unchanged apart from the fifth tab, a setup-less Prayer hub of stubs, and hidden Learn sections.

### 3.1 Dependencies

`adhan` ^4.4 (MIT), `@capacitor/geolocation` ^8 (MIT). Nothing else. Run `npx cap sync` once and commit the generated plugin lists. Hijri uses `Intl` plus our own tabular arithmetic. Compass uses WebView DeviceOrientation events.

### 3.2 Stores (each with `version` and `migrate`)

| File | Key | Synced | In backup | Contents |
|---|---|---|---|---|
| `src/stores/place-store.ts` | `takrar-place` | never | **no** | `place: {lat, lng (2 dp), label, countryCode, tz, source:'gps'|'city'} | null` |
| `src/stores/prayer-store.ts` | `takrar-prayer` | never | yes | `method`, `madhab:'standard'|'hanafi'`, `highLatRule:'auto'|…`, `offsets{fajr..isha}`, `customAngles?`, `hijriOffset` (-2..2), `alerts{[prayer]:{mode:'off'|'silent'|'default'|'chime', preAlertMin}}`, `homeStrip`, `ramadanMode:'auto'|'on'|'off'`, `imsakMin`, `setupDone`, `previous?` (for Undo) |
| `src/stores/worship-store.ts` | `takrar-worship` | never (opt-in later) | yes | `prayers{[iso]:{fajr..isha:{s:'ontime'|'late'|'missed', at}}}`, `fasts{[iso]:{s:'fasted'|'owed'|'exempt', at}}`, `madeUp{prayers:n, fasts:n}`, `pauses[{id,from,to?}]`, `tasbihTotals{[id]:n}` |
| `src/stores/deen-store.ts` | `quran-deen` | **yes** | yes | `cards{[cardId]: Sm2Fields & {deck, itemRev, addedAt, suspended?}}`, `lessonsDone{[lessonId]:ts}`, `depth{[deckId]:'meaning'|'arabic'}`, `school: 'hanafi'|'maliki'|'shafii'|'hanbali'|null`, `newPerDay` (5), `introduced{[iso]:n}` |
| `src/stores/zakat-store.ts` | `takrar-zakat` | never | yes | inputs, nisab basis, price per gram, `hawlStartIso` |

Card id format: `<deck>:<itemId>:<facet>` (e.g. `nawawi40:01:recall`, `names99:042:ar-en`, `course-purification:wudu-02:c1`).

`quran-deen` is registered in all five places: `STORE_NAMES`, `STORE_SCHEMA_VERSIONS`, `mergeStore` (`src/lib/sync/merge.ts`), `STORES` (`rehydrate.ts`), `backup.ts`, and pinned in `fixtures.test.ts`. Merge: per card the later `lastReview` wins (same as lesson cards); `lessonsDone` earliest timestamp; settings fields from the newer side. fast-check property tests (idempotent, commutative, no loss). Tests assert: `STORE_NAMES` excludes the four `takrar-*` stores; backup output contains no `lat`/`lng`.

Existing synced `quran-essentials.counters` holds tasbih counts. Do not change that store's shape.

### 3.3 Shared libs written complete with tests (features consume, never edit)

- `src/lib/prayer/engine.ts`: `computeDay(place, iso, settings) → {fajr, sunrise, dhuhr, asr, maghrib, isha}` (epoch ms, `null` when a time is invalid at high latitude), `nextPrayer(place, settings, now)`, `currentWindow(place, settings, now) → 'morning'|'evening'|null`, `qiblaBearing(place)`, `formatTime(ms, tz)` (always the place's IANA tz). Offsets applied last. `highLatRule:'auto'` uses adhan's recommended rule.
- `src/lib/prayer/methods.ts` (adhan's methods plus `custom`), `src/lib/prayer/regions.ts` (ISO country → default method and Asr position, our own table with a reason string per row; fallback MWL).
- `src/lib/prayer/tools.ts`: the tile list for the `/prayer` hub (id, title, href, `ready`). Integration flips `ready` for anything that did not land.
- `src/lib/prayer/widget-payload.ts`: `prayerWidgetPayload() → {prayers:{name, at}[]} | null` (7 days from the stores).
- `src/lib/hijri/convert.ts`: `toHijri(date, offset)`, `fromHijri(y, m, d, offset)`, `hijriMonthLength`, `isRamadan(date, offset)`. `Intl` `islamic-umalqura` feature-tested at runtime; our own tabular fallback.
- `src/lib/location.ts`: `getCoarseLocation()` (native plugin with coarse accuracy, one shot; `navigator.geolocation` on web), `roundCoord`.
- `src/lib/notify/registry.ts` (ID ranges and iOS budget, section 3.6) and `src/lib/notify/apply.ts`: `applyRange(range, notifications)` cancels pending in the range, schedules the new set, and skips when a hash of the desired set equals the last applied.
- `src/lib/native-plugins.ts`: typed `AdhanHealth` (`isIgnoringBatteryOptimizations`, `openBatterySettings`, `openExactAlarmSettings`) and `TakrarWidget.update` v2 (adds optional `prayers`), each behind `Capacitor.isPluginAvailable`.
- `reviewSm2<T extends Sm2Fields>(card, quality)` exported from `src/lib/spaced-repetition.ts` (the existing private `applySm2`; existing wrappers and tests unchanged).
- `src/types/deen.ts` (section 5.3), `src/lib/deen/{load,queue,cards,normalize-arabic,glossary}.ts`: deck loader, `buildDeenQueue(cards, dayEnd, {newPerDay, reviewCap: 20})`, card creation per facet, Arabic skeleton normaliser, glossary lookup.
- `src/content/deen/registry.ts`: every deck id with title, route, lazy loader pointing at `src/content/deen/decks/<deck>.ts`. Stubs export `{ ready: false }`. Deck ids: `nawawi40`, `adhkar-morning-evening`, `adhkar-after-prayer`, `adhkar-sleep-waking`, `duas-daily`, `salah-words`, `names99`, `course-purification`, `course-fasting`.
- `scripts/build-deen.mjs` (`--deck <id>`, `--check`), `src/lib/deen/content-integrity.test.ts`, `content/deen/` skeleton (section 5.2), `content/deen/glossary/core.json` (about 40 core terms), and a 3-item fixture deck under `content/deen/_fixture/` used by tests only.
- `scripts/check-bundle.mjs`: after build, fails if a chunk referenced by root `index.html` contains adhan; prints `out/` size delta. Budgets: Home first-load JS growth under 6 KB gzip; `out/` growth under 12 MB.
- `src/components/ui/stub-page.tsx`.

### 3.4 Extension slots (stub files foundations creates and mounts; each has exactly one later owner)

| File | Export and props | Mounted in | Owner |
|---|---|---|---|
| `src/components/home/prayer-strip.tsx` | `HomePrayerStrip()` | `src/app/page.tsx` | prayer-times |
| `src/components/prayer-sync.tsx` | `PrayerSync()` | `providers.tsx` | prayer-alerts |
| `src/components/prayer/slots/hijri-line.tsx` | `HijriLine({now})` | `/prayer` page | hijri-ramadan |
| `src/components/prayer/slots/ramadan-banner.tsx` | `RamadanBanner()` returns null when not in season | `/prayer` page | hijri-ramadan |
| `src/components/prayer/slots/row-tracker.tsx` | `RowTracker({iso, prayer, startMs, endMs})` | each prayer row | worship-tracking |
| `src/components/prayer/slots/adhkar-now.tsx` | `AdhkarNow({window, afterPrayer})` | `/prayer` page | adhkar-duas |
| `src/components/review/deen-section.tsx` | `DeenReviewSection()` | review client | deen-engine |
| `src/components/essentials/learn-rows.tsx` | `LearnRows()` | `/essentials` | deen-engine |

Stubs return null. prayer-times renders the four `/prayer` slots in its page with exactly these props. The Android widget reads `prayerWidgetPayload()`; `widget-sync.tsx` has a single writer, android-native.

### 3.5 Licensing plumbing

- `scripts/build-licenses.mjs` appends every `data-sources/licenses.d/*.txt` in filename order after its template. Each package adds its own fragment (`NN-<pkg>.txt`) and `data-sources/<source>/SOURCE.md` (URL, pinned version or commit, licence, retrieval date, sha256). `data-sources/README.md` gets one section pointing at `licenses.d/` and the per-folder SOURCE.md files, and the adhan and geolocation rows.
- `public/licenses.txt` is regenerated only by integration.

### 3.6 Notification IDs and iOS budget (`registry.ts`)

| Range | Use | iOS slots |
|---|---|---|
| 7100-7119 | existing hifz reminders (untouched) | 9 |
| 20000-20999 | prayer alerts, `20000 + dayIndex*20 + slot` | 48 |
| 21000 | "Open Takrar to keep prayer alerts coming" tail | 1 |
| 22000-22009 | adhkar morning/evening (repeating daily) | 2 |
| 22100-22109 | hawl, optional fasting reminders | 4 |

Total 64. Android horizon 30 days; iOS as many days as fit in 48.

### 3.7 Offline, service worker, CI

- Bundled with JS via dynamic import: decks, glossary, events. Fetched on demand from `public/data/`: `cities.json`, `mosques/<CC>.json`. In native these are inside the app bundle. `public/sw.js` gains a `/data/*` stale-while-revalidate rule into `takrar-data-v1`, kept across activations like the audio cache.
- `ci.yml`: TZ matrix extended to `src/lib/prayer src/lib/hijri src/lib/worship`; `node scripts/build-deen.mjs --check` step (the same check runs in vitest, so the Netlify gate covers it).
- `e2e/smoke.spec.ts` updated once for five tabs; `e2e/routes.spec.ts` cold-loads every new route under web and native static serving.

### 3.8 Files only foundations edits (later needs go through HANDOFF.md, section 9)

`package.json`, `package-lock.json`, `src/components/layout/bottom-nav.tsx`, `src/components/layout/settings-panel.tsx`, `src/components/providers.tsx`, `src/components/ui/icons.tsx`, `src/lib/routes.ts`, `src/lib/sync/*`, `src/lib/backup.ts`, `src/lib/spaced-repetition.ts`, `src/lib/static-params.ts`, `src/stores/*`, `src/types/*`, `src/app/page.tsx`, `src/app/essentials/page.tsx`, `src/app/review/*`, `scripts/build-licenses.mjs`, `scripts/build-deen.mjs`, `data-sources/README.md`, `public/sw.js`, `.github/workflows/*`, `e2e/smoke.spec.ts`, `src/content/deen/registry.ts`, `src/lib/prayer/{engine,methods,regions,tools,widget-payload}.ts`, `src/lib/hijri/convert.ts`, `src/lib/notify/*`, `src/lib/deen/*`.

## 4. Modules: data and licensing

| Module | Data or library | Licence | Notes |
|---|---|---|---|
| Prayer times, qibla bearing | `adhan` | MIT | on-device only |
| Location | `@capacitor/geolocation`; web API | MIT | coarse, one shot, rounded |
| City search, reverse label, regional default | GeoNames `cities15000` trimmed to name, country, lat, lng, tz → `public/data/cities.json` (target under 350 KB gzip) | CC BY 4.0 | `scripts/build-cities.mjs`; attribution fragment |
| Method-by-country table, explainer, events list, zakat notes, glossary, all English | ours | own work | |
| Hijri | `Intl` + own tabular fallback | platform / own | dates labelled "expected" |
| Compass | DeviceOrientation events | platform | true-north: `webkitCompassHeading` on iOS; on Android apply declination from our own WMM implementation over NOAA coefficients (public domain) if the builder can pin and test it, else label the heading "magnetic" |
| Prayer alert sound | system default, silent, or the Takrar chime (`scripts/build-chime.mjs`, deterministic sine synthesis) | own work | no adhan recording; `mode` is a string so `adhan` can be added later |
| Mosques | OpenStreetMap (`amenity=place_of_worship` + `religion=muslim`) per-country packs | ODbL | attribution on screen and in licenses; pipeline script committed; derived files publicly downloadable; conditional on size (under 8 MB total) |
| Quran text in decks | existing Tanzil-built surah JSON, by reference only | existing | never retyped |
| Hadith, dua, dhikr Arabic | classical texts, public domain; our vocalisation and punctuation; collated against two witnesses | own transcription of PD text | nothing bundled from Quran.com, Sunnah.com dumps, Darussalam, Qahtani's English or arrangement, or hadith-api |
| Gold and silver prices | user-entered | n/a | no openly licensed feed found |

Explicitly not used: Quran Foundation APIs, Sunnah.com API or dumps, Mawaqit, any adhan recording, map tiles (a tile request would send location off device), any price feed.

## 5. Content pipeline and guardrails

### 5.1 Provenance rules

- **Quran**: referenced by `surahId`/`ayah`/`ayahEnd`, rendered from the surah files with the user's translation. An item with `quran` set stores no Arabic or translation of its own.
- **Hadith and dhikr Arabic**: the consonantal skeleton (diacritics, tatweel, punctuation stripped; alef and hamza forms normalised by `normalize-arabic.ts`) must match across at least two independent witnesses, at least one not derived from Sunnah.com. Witnesses are read for collation only (scans of public-domain prints on archive.org, dorar.net, shamela.ws, islamweb, hadith-api for comparison, sunnah.com page views for comparison). Each witness entry stores `{name, ref, skeletonSha256}`; the build checks the shipped Arabic's skeleton hash equals them, or that a `provenance.note` records the variant chosen and why.
- **Numbering schemes are named**: Fath al-Bari (Bukhari), Abd al-Baqi (Muslim, Ibn Majah), Muhyi al-Din Abd al-Hamid (Abu Dawud), Ahmad Shakir (Tirmidhi), Abu Ghudda (Nasa'i). A "view on Sunnah.com" link-out is allowed (a hyperlink, not data).
- **English**: our own translation from the Arabic only. The translator must not open Darussalam, Muhsin Khan, Khattab, Sunnah.com English or Qahtani's English. Checked by a fresh agent that sees only the Arabic and our English.
- **Gradings**: stored `{grade, by, in, quote}` and shown as "Hasan: al-Tirmidhi, in the Jami' after the hadith". Preference: inclusion in the two Sahihs; verdicts inside public-domain works (al-Tirmidhi, al-Nawawi, Ibn Hajar, al-Hakim with al-Dhahabi, al-Daraqutni); then modern verdicts attributed by name and work as a short fact. Where named authorities disagree, both are shown. Unlocatable verdicts are deleted.
- **Inclusion rule**: in al-Bukhari or Muslim, or graded sahih or hasan by at least one named authority whose verdict was located. Narrations found weak by everyone located are not in decks, and are listed on `/sources` under "not included, and why". Al-Nawawi's Forty ships complete as a named classical work; disputed entries show al-Nawawi's verdict beside the dissent.
- **Fiqh**: evidence is a Quran ref, a corpus hadith, or a consensus citation (Ibn al-Mundhir, Ibn Hazm's Maratib al-Ijma', Ibn Rushd reporting agreement). School positions come from one named primer per school, cited by work and chapter with the Arabic phrase stored in `quote`: Hanafi Mukhtasar al-Quduri; Maliki al-Risala of Ibn Abi Zayd; Shafi'i Matn Abi Shuja'; Hanbali 'Umdat al-Fiqh. Every difference is cross-located in Bidayat al-Mujtahid. Primer citations cannot be machine-verified; they are the highest content risk and always carry the visible unreviewed status.
- **Citation numbers in any design document or brief are leads, not data.** No agent copies a number into a data file without confirming it in two witnesses.

### 5.2 Authored layout (one file per item; directories are package-owned)

```
content/deen/
  STYLE.md  ERRATA.md  reviewers.json  collections.json  scholars.json  works.json   (foundations)
  glossary/core.json (foundations)   glossary/<package>.json (each package)
  _fixture/                                                                           (foundations, tests only)
  nawawi40/{SELECTION.md, ids.lock.json, items/01.json … 42.json}
  adhkar/<deck>/{SELECTION.md, ids.lock.json, items/*.json}
  names99/{ids.lock.json, items/001.json … 099.json}
  course/<unit>/{unit.json, ids.lock.json, lessons/*.json}
```

`node scripts/build-deen.mjs --deck <id>` validates and emits `src/data/deen/<deck>.json` and `src/data/deen/glossary/<package>.json`. Each package commits only its own emitted files, so nothing emitted is shared. A package that needs a new entry in `collections.json`, `scholars.json` or `works.json` adds a sidecar `content/deen/<its-dir>/registry-additions.json`, which the build script merges; the shared files are not edited.

`content/deen/STYLE.md` (foundations): plain modern English, sentence for sentence; "Allah"; the ﷺ glyph; supplied words in square brackets; no commentary inside a translation; notes are separate, at most three, each an attributed paraphrase with work and location; Arabic terms kept in English are written `[[term-id]]` and must resolve in the glossary; one house transliteration scheme via `src/lib/transliterate.ts` where the text is fully vocalised.

### 5.3 Types (`src/types/deen.ts`)

```ts
type ReviewStatus = 'draft' | 'source-checked' | 'scholar-reviewed';
interface QuranRef { surahId: number; ayah: number; ayahEnd?: number }
interface Citation { collection: string; number: string; numbering: string; book?: string; narrator?: string; altNumbers?: { numbering: string; number: string }[] }
interface Grading { grade: 'sahih'|'hasan'|'daif'|'mawquf'|'mursal'|'agreed-upon'|'in-sahih'; by: string; in: string; quote?: string }
interface Provenance { witnesses: { name: string; ref: string; skeletonSha256: string }[]; note?: string }
interface Review { status: ReviewStatus; by?: string[]; date?: string; log?: string[] }
interface Note { text: string; source: { work: string; location: string } }
interface TextItem { id: string; deck: string; rev: number; title: string; cue: string;
  quran?: QuranRef; arabic?: string; segments?: number[]; transliteration?: string; translation?: string;
  citations: Citation[]; gradings: Grading[]; provenance?: Provenance; notes?: Note[];
  usage?: { when: string[]; repeat?: number; evidence?: string };
  variants?: { label: string; arabic: string; citations: Citation[] }[]; review: Review }
interface NameItem { id: string; rev: number; order: number; arabic: string; transliteration: string; meaning: string; explanation: string;
  evidence: { kind: 'quran-name'|'quran-derived'|'hadith'|'list-only'; quran?: QuranRef[]; form?: string; hadith?: string };
  explanationSource?: { work: string; location: string }; review: Review }
interface Claim { id: string; text: string; kind: 'agreed'|'differs'|'definition'|'how-to';
  evidence: ({ quran: QuranRef } | { item: string } | { consensus: { work: string; location: string } })[];
  positions?: { school: 'hanafi'|'maliki'|'shafii'|'hanbali'; text: string; source: { work: string; location: string }; quote?: string }[];
  cards: { id: string; front: string; back: string; school?: string }[] }
interface Lesson { id: string; unit: string; order: number; rev: number; title: string; intro: string; claims: Claim[];
  check: { q: string; options: string[]; answer: number; claim: string }[]; review: Review }
interface GlossaryTerm { id: string; arabic: string; translit: string; short: string; long?: string; seeAlso?: string[] }
```

### 5.4 Stages (each done by a different agent from the one before; C, F, G, H by agents that never saw the draft's reasoning)

A selection memo (own selection; never Qahtani's order or contents) → B Arabic acquisition (witness 1, no English consulted) → C collation (witness 2, hashes) → D vocalisation and authored segments (sentence ends only; tashkeel checked against a vocalised witness) → E translation (Arabic only) → F blind back-check (omissions, additions, tense and number, loaded terms; every finding fixed or answered in `review.log`) → G citation check (number confirmed in two witnesses) → H grading check (verdict located and quoted) → I mechanical validation → J status `source-checked` → K scholar review later (`scholar-reviewed`, reviewer in `reviewers.json`).

Only `source-checked` or `scholar-reviewed` items are emitted. Where a witness cannot be reached the item stays `draft`; expect fewer shipped items than authored.

### 5.5 Build-enforced guardrails (`build-deen.mjs --check` and `content-integrity.test.ts`)

1. No item below `source-checked` is emitted; every item has `review`.
2. Hadith and dua items have a citation with `collection` (known), `number`, `numbering`.
3. Every non-Sahih item has a grading with `by` (known scholar) and `in`.
4. Non-Quran items have two witnesses, not all Sunnah.com-derived, with matching skeleton hashes or a variant note.
5. Quran refs resolve; an item with `quran` stores no Arabic or translation.
6. A `quran-name` Name's cited ayah contains the Name's normalised skeleton.
7. Arabic is NFC, only allowed Arabic code points, no tatweel, no Latin.
8. Every `[[term]]` resolves; known glossary transliterations appearing unmarked are flagged.
9. Notes and Name explanations with interpretive content have a `source`.
10. `differs` claims have at least two positions, each with `source`; `agreed` claims have consensus, Quran or hadith evidence.
11. Lesson `intro` is at most 60 words and contains no ruling vocabulary; rulings live only in claims.
12. Banned phrasing in fiqh text: "the correct opinion", "the strongest view", "scholars agree" without a consensus citation.
13. Two glossary files may not define a term differently.
14. Ids in `ids.lock.json` never disappear; a changed item must raise `rev`.
15. Translation length within 0.6x-2.5x the Arabic word count; at most 3 notes; at most 6 claims per lesson.

### 5.6 Trust surfaces (owned by deen-engine, used by content packages)

`<CitationLine>`, `<GradingLine>` (tap for the Arabic quote), `<PositionsTable>` (user's school first if set, never hiding the others), `<Term>` (tap-to-define bottom sheet, "Learn this term"), `<ReviewBadge>` (opens `/sources#method`), `<ReportProblem>` (prefilled message with item id and rev; `NEXT_PUBLIC_CONTACT_EMAIL` when set, else the Share sheet; hidden if neither), `<MemoriseFlow>` (Read → Build → Recall), and the `/sources` page (method, scope statement, reviewers with the empty state "No scholar has reviewed this yet. We will name them here when one does.", not-included list, errata, link to `/licenses.txt`). A single constant `SHOW_UNREVIEWED_FIQH` (default true) in `src/lib/deen/flags.ts` lets the owner hold the course back.

### 5.7 Cards per item type

| Item | Facets | Notes |
|---|---|---|
| Hadith | `recall` (chunk then chain by authored segments), `meaning`, `narrator` | no audio (none cleared) |
| Dhikr or dua | `recall`, `meaning`, `usage` | Quranic items hand off to normal ayah review, no duplicate cards |
| Name | `ar-en`, `en-ar` | introduced 5 at a time |
| Fiqh claim | authored `cards[]` | with a school chosen, that school's card is added and the rest shown on the back as "also held" |
| Glossary term | `term` | only when the user taps "Learn this term" |

Existing Essentials `memorized[itemId]` flags for surviving ids become seeded cards (conservative values like `createSeededCard`); `counters` and `favorites` stay untouched.

## 6. Feature notes that briefs rely on

- **Alerts**: `planPrayerAlerts({now, place, settings, platform})` is pure; rescheduled on mount, foreground, settings or place change and day rollover, debounced and hash-skipped. Android channels are immutable, so one per sound: `prayer-default-v1`, `prayer-chime-v1` (sound `takrar_chime`), `prayer-silent-v1`. iOS offers default and silent only (a bundled custom sound cannot be compile-checked here). Web says: "Prayer alerts need the app. Times work here." Notification text is "Dhuhr · 12:41".
- **Exact alarms**: `SCHEDULE_EXACT_ALARM` is declared only by android-native; when not granted, alerts schedule inexactly and the health check says "may arrive several minutes late" with a button to the system setting. `USE_EXACT_ALARM` is not used.
- **Match my mosque**: enumerate method × Asr × high-latitude rule; residual = entered minus computed; score = sum of |residual − rounded median residual per prayer| plus a small penalty per non-zero offset, regional default wins ties; if Fajr or Isha is still more than 3 minutes off, solve custom angles by bisection.
- **Zakat**: both nisab bases side by side (gold 85 g with the 87.48 g reckoning noted; silver 595 g with 612.36 g noted), each figure attributed; 2.5% on a lunar year; positions on worn jewellery and debts shown as differences; scope is cash, gold, silver, trade goods, receivables; livestock and crops named as out of scope.
- **99 Names**: the sound hadith (al-Bukhari, Muslim) gives the number without a list; the familiar enumeration comes through al-Tirmidhi's narration, which many hadith scholars hold to be a narrator's addition. The deck uses that order because it is the one people memorise, says so on its intro card, and labels `list-only` Names.
- **Iftar dua**: "Dhahaba al-zama'" is the default; "Allahumma laka sumtu" is shown under it with its mursal status attributed.
- **Mosques**: Overpass or extract is used at build time only, never from the app. If the builder cannot fetch the data, ship the script, the screen and a small sample set, keep the tile `ready: false`, and flag it.

## 7. Testing strategy

- **Unit (vitest, node env)**: every `src/lib/**` module. Golden prayer times against adhan reference values (8 cities × 4 methods within 1 minute), fast-check ordering for |lat| < 48 and no NaN up to 66 with the auto rule, DST days for London and New York, TZ matrix. Property tests for merges, alert budget and ID stability, pause and streak logic, match-wizard recovery. Golden tables for Hijri, qibla (10 cities within 0.5°), sun azimuth (within 1°).
- **Content gate**: `build-deen.mjs --check` in vitest and CI; an ungrounded item fails the Netlify deploy.
- **Playwright** (dev, static web, static native routing): one `e2e/<pkg>.spec.ts` per package, state seeded through localStorage, `page.clock` for time, `context.setGeolocation` for the GPS path, a request listener asserting no coordinates appear in any URL or body, offline reload for `/prayer`, `/qibla`, `/calendar`, `/tasbih`. Cold deep-load of every new route under native routing.
- **Privacy tests**: coordinates absent from sync payloads and backup.
- **Copy test**: no negative wording in tracker and Ramadan copy (word-list test).
- **Native**: `assembleDebug` in GitHub Actions on a `mobile/**` branch for android-native. Real alarm delivery, sound, sensors and widget refresh are owner device checks and are never claimed as verified.
- **Gate for every package before merge**: `npx tsc --noEmit`, `npm run test:run`, `npm run build`, its own e2e spec, existing smoke.
- **Fresh review passes after merge** (agents that did not build the package): UX at 375px, dark theme, reduced motion, offline, copy check (no-ai-slop), accessibility; adversarial data-safety pass; content audit (section 8, wave 3).

## 8. Work packages

| Wave | Id | Owns (summary) | Depends on |
|---|---|---|---|
| 0 | foundations | section 3 | none |
| 1 | prayer-times | `/prayer`, setup, settings, why, Home strip, cities data | foundations |
| 1 | match-mosque | `/prayer/match`, `src/lib/prayer/match.ts` | foundations |
| 1 | prayer-alerts | planner, `prayer-sync.tsx`, `/prayer/alerts` | foundations |
| 1 | android-native | `android/**`, `ios/App/App/Info.plist`, `widget-sync.tsx`, chime | foundations |
| 1 | qibla | `/qibla`, `src/lib/qibla/**` | foundations |
| 1 | hijri-ramadan | `/calendar`, `/ramadan`, events, two slots | foundations |
| 1 | worship-tracking | `/tasbih`, `/prayer/tracker`, row slot, counter | foundations |
| 1 | zakat | `/zakat`, `src/lib/zakat/**` | foundations |
| 1 | mosques | `/mosques`, pipeline, packs | foundations |
| 1 | deen-engine | session player, trust components, review and learn slots, glossary, sources | foundations |
| 2 | hadith-nawawi40 | `content/deen/nawawi40/**`, `/hadith` | deen-engine |
| 2 | adhkar-duas | `content/deen/adhkar/**`, `/adhkar`, Essentials audit, adhkar-now slot | deen-engine, worship-tracking |
| 2 | names99 | `content/deen/names99/**`, `/names` | deen-engine |
| 2 | course-ui | `/course`, lesson player | deen-engine |
| 2 | course-purification | `content/deen/course/purification/**` | foundations |
| 2 | course-fasting | `content/deen/course/fasting/**` | foundations |
| 3 | content-audit | fresh re-verification of all shipped items | wave 2 content |
| 3 | integration | regenerate licences and search index, `cap sync`, full matrix, bundle check, `tools.ts` ready flags | all |

## 9. Merge-conflict rules

1. A package creates or edits files only under its `ownsPaths`, plus its own `e2e/<pkg>.spec.ts`, `data-sources/<source>/`, `data-sources/licenses.d/NN-<pkg>.txt`, `content/deen/glossary/<pkg>.json`.
2. A package replaces its own stub files; it never edits a file in section 3.8.
3. Generated committed files (`public/licenses.txt`, `package-lock.json`, `src/data/search-index.json`, Capacitor-generated files) are integration-only.
4. A need in a shared file is written to `HANDOFF.md` at the root of the package's worktree (what, where, why); the orchestrator applies it serially. The package must still build and pass without it.
5. Worktrees branch from the committed integration branch that contains foundations. Integration lands on a branch; main is pushed only after the full gate, as one tested release (main auto-deploys to Netlify).
6. android-native is compile-checked by pushing a `mobile/**` branch (triggers `android.yml`); it is not merged until that run is green.

## 10. Performance and size

adhan loads only by dynamic import from Prayer routes, the Home strip and `PrayerSync`, and only after a place exists. Decks, course units, cities and mosque packs load on their own screens. Notification replans are debounced and hash-skipped. `/prayer` shows at most one contextual chip. localStorage growth is small (about 60 bytes per logged day, about 120 bytes per card).

## 11. Deferred, and why

| Item | Reason |
|---|---|
| Adhan voice recording; user-chosen sound file | no cleared recording; needs native channel work that cannot be device-tested |
| iOS custom chime, iOS widget, Live Activities, watch | Xcode and App Group changes; owner's Apple account; no Mac to compile |
| Mosque-published times (Mawaqit), iqamah | written agreement |
| Sunnah.com API, large hadith browser | written terms |
| QUD v5 riwayat | written clarification |
| Live gold and silver prices | no openly licensed feed |
| Map tiles, map-line or AR qibla | tile requests would send location off device |
| Web prayer alerts | a server would need the user's times, hence location |
| Named scholar review | owner must recruit; data model, badge and reviewers list are ready |
| Course unit on prayer; creed track; further collections; other languages | follow the first audit and a reviewer |
| Opt-in sync for prayer settings and worship logs | privacy decision for the owner; device-only plus backup is the safe default |
| Hadith and adhkar audio | no cleared recordings |
| Kids profile, family circles | minors' data policy |
| Delivery guarantees for alerts | on-device testing across OEMs |

## 12. Risks to put in front of the owner (none block the build)

1. **Exact alarms**: declaring `SCHEDULE_EXACT_ALARM` reverses the earlier manifest decision. It is isolated to one line in android-native; the owner confirms against Play policy at submission. Without it alerts may be minutes late.
2. **Alert reliability, compass accuracy, widget refresh, chime playback** are device-only and unverified.
3. **Content**: "source-checked" by agents is not scholarly review; the app says so. Fiqh primer citations cannot be machine-checked. The public-domain position on hadith Arabic with our own vocalisation is a reasoned judgement, not legal advice. AI vocalisation can err; items whose tashkeel cannot be confirmed against a vocalised witness stay draft.
4. **Witness access**: collation needs web access; unreachable witnesses mean fewer shipped items.
5. **Fifth tab** changes navigation for every user.
6. **Mosque packs** depend on a polite one-off extract; optional by design.
7. **Existing `essentials.json`** cites bare collection names; the adhkar package audits it and may remove items it cannot ground.
8. **Timing**: Ramadan 1448 is expected about 8 February 2027; prayer-times, prayer-alerts, hijri-ramadan and course-fasting are the time-sensitive packages.
