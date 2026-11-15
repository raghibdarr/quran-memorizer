# HANDOFF: prayer-times

Needs in shared files (spec 9.4). The package builds and passes without them.

1. **data-sources/README.md** (foundations-owned): add a row to the all-in-one sources table:
   `| GeoNames cities15000 (download.geonames.org, retrieved 2026-11-13) | city search, place label after a location fix, the place's time zone | CC BY 4.0 | licenses.d/20-geonames.txt |`
   and note that the zip is archived outside the repo at `Downloads/takrar-sources/geonames/cities15000.zip`
   (sha256 in `data-sources/geonames/SOURCE.md`). Owner's call whether to commit the 3.3 MB zip instead.
2. **Integration:** regenerate `public/licenses.txt` (picks up `data-sources/licenses.d/20-geonames.txt`).
3. **Playwright:** `e2e/prayer-times.spec.ts` (14 tests) passed against this worktree's static build. Its offline test
   swaps the host to 127.0.0.1 (the service worker is unregistered on localhost) and skips under the dev server.
4. **Local builds in a worktree:** Turbopack refuses the node_modules junction; `npx next build --webpack` works.
   Without a `.env.local` the app needs `NEXT_PUBLIC_SUPABASE_URL` set to anything (a dummy local URL was used here).
5. `src/components/prayer/tool-tiles.tsx` is unchanged; the hub renders it (readyTools()).
6. **Review pass (fresh reviewer), for foundations' `src/lib/prayer/engine.ts`** (not edited here, spec 3.8): in polar
   night with the automatic rule the day's times come out of order. Tromsø (69.65, 18.96, Europe/Oslo), 2026-12-21,
   Muslim World League, `highLatRule: 'auto'`: Fajr 07:38, Sunrise 10:57, Dhuhr 11:32, **Asr 10:52**, Maghrib 12:06,
   Isha 15:24, so Asr precedes Dhuhr and `currentPrayer` reports Asr before Dhuhr has begun. The hub shows what the
   engine returns; the engine should either keep the order or return null for a time it cannot place.
   Until then the hub guards itself (`inOrder` in `src/components/prayer/times/model.ts`): a time out of order is shown
   as "No time today" and "now" moves to the kept prayer whose time is in. `nextPrayer`, alerts and the Home strip
   still read the engine directly, so the engine fix is still needed.
7. **Review pass, for hijri-ramadan and adhkar-duas:** the hub now always mounts `<RamadanBanner/>` and shows
   `<AdhkarNow/>` only while the banner renders nothing (CSS, `data-chip="ramadan"` / `data-chip="adhkar"`), so the
   banner alone decides its season. Both slots must render no DOM at all (return null) when they have nothing to show.
8. **Integration, settings panel (foundations-owned):** the hub's gear opens the app-wide settings panel. Its
   "Prayer times and alerts" row (spec 2.4) should sit near the top when the panel is opened from the Prayer tab. The
   hub also has a place chip under the title and a "Prayer settings" link straight under the times list.
9. **Second review pass:** the hub, the Home strip and the settings/setup previews now all read the same
   "shown" days (`shownDays` in `src/components/prayer/times/model.ts`): next prayer, current prayer and the adhkar
   window come from the rows with out-of-order times dropped, so `<AdhkarNow window>` is never 'evening' from an Asr
   the list doesn't show. Item 6 still stands for alerts and anything else that reads the engine directly.
10. **For qibla / mosques (anything that saves a place before prayer setup):** setup now pre-chooses the country's
    method and Asr for a place that was already saved, so those packages need do nothing beyond `setPlace`.
