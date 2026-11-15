# HANDOFF: mosques

Mosque finder (`/mosques`) from OpenStreetMap country packs. No shared files edited apart from
replacing the foundations stub `src/app/mosques/page.tsx`.

1. **Tile flag (`src/lib/prayer/tools.ts`, spec 3.8): keep `mosques` at `ready: true`.** The full
   worldwide build succeeded on 2026-11-14: 193 country packs, 216,523 mosques, 7,796,771 bytes
   (under the 8 MB budget). **Indonesia (ID) is not covered**: its list alone is 74,436 mosques /
   2.46 MB and does not fit with the rest. A place in Indonesia sees "We don't have a mosque list for
   Indonesia yet" with a "Change place" button (to `/prayer/settings`). To add it, either raise the budget (`--budget 10.5`) or make the
   format smaller; the owner should decide. Every other country with OSM mosques is covered
   (see `data-sources/osm-mosques/SOURCE.md` for the per-file list, counts and sha256).

2. **Service worker:** nothing to do. Foundations' `public/sw.js` already caches `/data/*`
   (stale-while-revalidate into `takrar-data-v1`), and the native apps carry `out/data/mosques/`
   in the bundle.

3. **Size:** `out/data/mosques/` is 7.80 MB; the `/mosques` page chunk is 40 KB (it carries the
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

10. **Second review (2026-11-15), data fixes; packs rebuilt offline from the same 2026-11-14 OSM answer:**
    - Packs are now filed under the code the place picker (GeoNames) gives a town, where Natural
      Earth's drawing differs: Crimea under UA (was RU, so a place in Simferopol found none of its
      own mosques), Western Sahara under EH (Laayoune, Dakhla; was MA), Christmas Island and the
      Cocos Islands under CX and CC. The table is `PLACE_PICKER_CODES` in
      `scripts/build-mosques.mjs`; the script and SOURCE.md say it takes no position on borders.
      The owner may want to read that wording.
    - 487 mosques that had been dropped as "open sea" are now placed by the nearest drawn coast
      within 100 km: most of the Maldives (67 -> 301), Stavanger, Tromso, Bodo, Cairns, Recife,
      Assab, Macau, Tuvalu. 34 are still unplaced (far islets, nearly all Indonesian).
    - Not changed, for the owner to know: a place sees only its own country's list, so a town on a
      border (or Jerusalem / East Jerusalem, which GeoNames files under IL and PS) misses mosques
      across the line; the screen says "Only mosques in <country> are listed".
    - Small lists load without a confirm step (the brief asked for a confirm line every time). The
      request still names only the country. Left as the UX pass made it; say if every country
      should ask first.
