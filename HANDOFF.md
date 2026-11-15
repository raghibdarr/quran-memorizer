# HANDOFF: all-in-one, after integration (2026-11-15)

One list, replacing the per-package notes the union merge left behind. Each package's own
history is in git (`git log -- HANDOFF.md`) and in its branch `aio/<package>`. The content
record is `content/deen/AUDIT-2026-11.md`; corrections are in `content/deen/ERRATA.md`.

## 1. Owner: decisions

1. **Exact alarms (spec 12.1).** android-native declares `SCHEDULE_EXACT_ALARM` (one manifest
   line). Confirm against Play policy at submission. Without the grant, prayer alerts are
   scheduled inexactly and the alerts screen says they "may arrive several minutes late".
   Hifz reminders, adhkar reminders and the hawl reminder now ask for inexact alarms
   explicitly, so none of them opens the "Alarms and reminders" screen by itself.
2. **Mosques, Indonesia.** 193 country packs, 216,523 mosques, 7.80 MB. Indonesia (74,436
   mosques, 2.46 MB) does not fit the 8 MB budget and shows "We don't have a mosque list for
   Indonesia yet". Raise the budget (`node scripts/build-mosques.mjs --budget 10.5`) or accept.
   Also: packs are filed under the place picker's country codes (Crimea under UA, Western Sahara
   under EH; table `PLACE_PICKER_CODES` in `scripts/build-mosques.mjs`), a border town sees only
   its own country's list, small lists load without a confirm step, and on desktop browsers
   without a `geo:` handler "Open in Maps" opens openstreetmap.org (`mapsHref` in
   `src/lib/mosques/links.ts` if no web link-out is wanted).
3. **Zakat basis.** `nisabBasis` defaults to silver (foundations contract); both bases are always
   shown side by side. No preselected basis needs `nisabBasis: NisabBasis | null` in the store.
4. **Zakat hawl reminder re-arm.** After it fires, next year's reminder is set the next time
   `/zakat` opens. For a re-arm without opening the screen, mount `syncHawlReminder`
   (`src/lib/zakat/reminder.ts`) in `providers.tsx`.
5. **GeoNames zip.** Archived outside the repo at `Downloads/takrar-sources/geonames/cities15000.zip`
   (sha256 in `data-sources/geonames/SOURCE.md`); commit the 3.3 MB zip instead if preferred.
6. **Opt-in sync** of prayer settings and worship logs stays deferred (spec 11): device-only plus
   backup is the default.
7. **Content for a scholar** (nothing is scholar-reviewed; the app says so):
   - The 12 open doubts in `content/deen/AUDIT-2026-11.md`, first.
   - The course units follow one short primer per school, which is not always that school's
     relied-upon view; each school's column wants a reviewer from that school.
     `SHOW_UNREVIEWED_FIQH` in `src/lib/deen/flags.ts` holds the course back if wanted.
   - Zakat notes `nisab-grams`, `basis` and `combining` stay draft; ten zakat quotes rest on the
     first verifier's pass (Minhaj al-Talibin 4, Kifayat al-Akhyar 3, al-Muhalla 2, Fath al-Mu'in 1).
   - `duas-daily:istikhara` keeps the narrator's aside inside the memorised Arabic (faithful to
     al-Bukhari 6382); the sleep set counts each of the three surahs three times in a row, where
     al-Bukhari 5017 describes the three read together three times over;
     `adhkar-sleep-waking:ayat-al-kursi` has no grading line (al-Bukhari 2311 is given without his
     own full chain); `duas-daily:toilet-leave` stays "Your forgiveness." (length rule G15).
   - Unit Fasting's three evidence hadith (al-Bukhari 1894, 1933; Abu Dawud 2357) were
     source-checked by the course-fasting verifier but not re-audited in the wave-3 audit (they
     only shipped once integration taught the build to emit them). The iftar dua also exists as
     the audited `duas-daily:iftar`, with slightly different English ("moist / assured" against
     "moistened / certain"); pointing lesson 6 at `duas-daily:iftar` needs the claim and card
     wording aligned and a `rev` raise.
   - Essentials ayah translations still carry footnote markers such as "[98]"; the old
     collection titles in `src/data/essentials.json` are Title Case with ampersands.
8. **Bundle baseline.** `scripts/bundle-baseline.json` was measured with webpack on a461010.
   Re-record it (`node scripts/check-bundle.mjs --write-baseline`) once this release ships.

## 2. Owner: device checks (never claimed as verified)

- **Android compile**: android-native was not compiled locally (no JDK or SDK). Push
  `mobile/allinone-native` (or any `mobile/**` branch from `allinone`) and wait for a green
  `.github/workflows/android.yml` run before releasing.
- **Prayer alerts**: delivery at the minute with and without the exact-alarm grant, the
  `prayer-chime-v1` chime, the silent channel, the "Open Takrar to keep prayer alerts coming" tail,
  the test alert, and after a reboot (the plugin re-shows alerts missed while the phone was off,
  15 s after boot). On iOS with every range full, the test alert is briefly a 65th pending
  notification.
- **Battery settings link** and the exact-alarm settings button on `/prayer/alerts`.
- **Qibla compass** on a real phone (true north via WMM2025 on Android and iOS), calibration
  hint, no-sensor fallback.
- **Widget refresh** with prayers (Android), including after the place or method changes.
- **iOS location prompt text**: "Used once to work out prayer times on your phone. Your location
  is never sent anywhere." (`ios/App/App/Info.plist`).
- **Adhkar and hawl reminders** fire at their times; taps open `/adhkar/now?set=…` and `/zakat`.
- **Erase everything on this device** now also cancels pending hifz, adhkar, hawl and prayer
  notifications; check nothing fires afterwards.

## 3. Applied by integration (2026-11-15)

- `scripts/build-deen.mjs`: a course unit's `evidence/*.json` is validated with every hadith
  guardrail and emitted as `evidence` beside the lessons; `<deck>-evidence:<id>` refs resolve in
  G10 (course-fasting 1, course-ui 1). `EmittedDeck.evidence?` added to `src/types/deen.ts`.
  The false G8 warning on `al-Hasan` (a person, not the term) is gone.
- `src/lib/prayer/engine.ts` (prayer-alerts 6, prayer-times 6): a time more than 20 h from its
  own Dhuhr is dropped, and Asr is dropped when adhan puts it outside Dhuhr..Maghrib by more
  than rounding (only above about 65.7°). With no Asr the prayer log treats Dhuhr's end as
  unknown (a tap is never "late" on a guess), and the hub runs Dhuhr on to Maghrib
  (`inOrder` in `src/components/prayer/times/model.ts`).
- `src/lib/hijri/convert.ts` (zakat 7): civil years 0 to 99 are read as written.
- `src/components/ui/bottom-sheet.tsx` traps Tab and Shift+Tab in the topmost sheet;
  `FocusTrap` removed from `term.tsx` (deen-engine 6).
- `src/app/review/review-client.tsx` (deen-engine 3): with no Quran cards but deen cards, one
  line "No Quran reviews yet. Find a surah" and the deen section first.
- `src/lib/deen/load.ts` (course-ui 3): a failed deck download is not cached, so retries work.
- `src/components/deen/positions-table.tsx` (course-ui 3): the primer source button's hit area
  grows to 44 px without moving the layout.
- `src/components/essentials/learn-rows.tsx` (adhkar 12): "53 to learn" until something is started.
- `src/app/essentials/page.tsx` (deen-engine 7, adhkar 12): subtitle "Plans, guides, hadith,
  duas and the Names"; a pointer to Adhkar and duas under the older Essentials section.
- `src/components/prayer/slots/adhkar-now.tsx` (adhkar 10): one chip on `/prayer`, as the
  spec says; when two sets fit, the second is a quiet second line inside it.
- `src/components/essentials-carry-over.tsx`, mounted in `providers.tsx` (adhkar 2): the
  Essentials carry-over runs for everyone, by dynamic import a few seconds after open.
- `src/components/layout/erase-device.tsx` (adhkar 3, prayer-alerts 3): cancels the app's
  pending notifications in every range.
- `src/lib/reminder-notifications.ts`, `src/components/adhkar/reminders.ts`,
  `src/lib/zakat/hawl.ts` (prayer-alerts 1): `isExactNotification: false`.
- `src/lib/native-plugins.ts` (android-native 2): `prayerTz?` on `TakrarWidgetData`.
- `src/components/ui/card.tsx` (prayer-alerts 12): `data-*` props reach the DOM.
- `content/deen/course/purification/lessons/water-01.json` (course-ui 3): stray commas removed
  from check question 3 (rev 3).
- `data-sources/README.md` (qibla 1, prayer-times 1): a row for every shipped all-in-one
  source; `public/licenses.txt` regenerated (11 fragments).
- Home first load: `widget-sync.tsx` reads the place and prayer stores by dynamic import on
  Android only, and the prayer store validates methods from a light id list
  (`METHOD_IDS` in `src/types/prayer.ts`), so neither store nor the method table is in Home's
  first load.
- New tests: `e2e/allinone-integration.spec.ts`, `src/lib/notify/ios-budget.test.ts`
  (everything on at once plans at most 64 on iOS), `src/lib/prayer/methods.test.ts`, polar-day
  and civil-year cases.

## 4. Not applied, and why

- **deen-engine 1** (emit a merged `registry.json`): already solved in deen-engine by
  `SIDECARS` in `src/components/deen/registry-names.ts`, guarded by a test that fails when a new
  sidecar is not listed.
- **course-fasting 2** (iftar evidence to `duas-daily:iftar`): needs a content edit, see 1.7.
- **zakat 1** (split the 22100-22109 range): only the hawl reminder uses it today. Whoever adds
  fasting reminders must split it first (for example `hawl: 22100-22101`, `fasting: 22102-22109`),
  because `applyRange` cancels the whole range.
- **prayer-alerts 4 and 5** (diff alarms by id instead of replacing the range; clear delivered
  alerts from the tray): correct today; worth doing if replanning shows as lag on slow phones.
- **prayer-alerts 8** (`AdhanHealth.openNotificationSettings()`): native code that cannot be
  compile-checked here; for the next android-native pass.
- **prayer-alerts 9** (move the bell icons into `src/components/ui/icons.tsx`): cosmetic.
- **prayer-times 8** (the settings panel's "Prayer times and alerts" row near the top when opened
  from the Prayer tab): the hub already has a gear, a place chip and a "Prayer settings" link.
- **adhkar 12, CitationLine / GradingLine** (stacked citation layout at 375 px like
  `src/components/adhkar/source-line.tsx`; Shamela paths as links): a deen-engine UI pass.
- **course-ui 3, long claims** (wudu-02 point 2, fasting-06 `iftar-dua`): splitting them is a
  content edit; a numbered-steps form needs `steps?: string[]` on `Claim` first.
- **Engine, alerts and the Home strip near the poles**: the hub's `inOrder` guard stays as a
  second line of defence.

## 5. Building in a worktree

Turbopack refuses the `node_modules` junction ("points out of the filesystem root"). Build with
`node scripts/build-workers.mjs && npx next build --webpack && node scripts/flatten-segments.mjs`
and a `.env.local` (or placeholder `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`),
or every page shows "This page couldn't load". The dev server likewise needs `--webpack`.
`npx cap sync` in a worktree rewrites `android/capacitor.settings.gradle` and
`ios/App/CapApp-SPM/Package.swift` with paths through the junction; do not commit those.

## 6. Contracts other packages use (deen-engine; `src/components/deen`, re-exported from `index.ts`)

- `CitationLine({citation})`, `GradingLine({grading})`, `PositionsTable({positions, school})`,
  `Term({id, children})`, `RichText({text})`, `ReviewBadge({review})`,
  `ReportProblem({itemId, rev, title?})`, `MemoriseFlow({item, depth, onDone, kind?})`,
  `DepthChoice({title, onChoose})`, `useItemState(deck, itemId)`, `useDeckStates(deck)`.
- `learnHref(deck, itemId, depth?)` → `/review/deen?learn=<deck>:<id>[&depth=]`; `sessionHref(deck?)`.
- `/sources` lists the section whose heading contains "Not included" from every deck's SELECTION.md.
- ERRATA.md lines: `- <ISO date> · <deck>:<itemId> rev N: what changed`, read for "Text corrected on <date>".
- e2e seam: `window.__TAKRAR_TEST_DECKS__` (read only by `src/components/deen/deck-source.ts`).
- Notification taps carry `extra.url` and are routed by ReminderSync's `onReminderTap`; if
  ReminderSync stops being mounted app-wide, move that listener.
