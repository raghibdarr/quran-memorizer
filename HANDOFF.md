# HANDOFF: mosques

Mosque finder (`/mosques`) from OpenStreetMap country packs. No shared files edited apart from
replacing the foundations stub `src/app/mosques/page.tsx`.

1. **Tile flag (`src/lib/prayer/tools.ts`, spec 3.8): keep `mosques` at `ready: true`.** The full
   worldwide build succeeded on 2026-11-14: 187 country packs, 216,193 mosques, 7,785,947 bytes
   (under the 8 MB budget). **Indonesia (ID) is not covered**: its list alone is 74,301 mosques /
   2.46 MB and does not fit with the rest. A place in Indonesia sees the calm "No mosque list for
   Indonesia yet" empty state. To add it, either raise the budget (`--budget 10.5`) or make the
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
   - "Open in Maps" is a `geo:` link (Android, Linux desktops) or `maps://` (iPhone, iPad, Mac).
     **Windows desktop browsers have no `geo:` handler, so the button does nothing there.** A web
     fallback (an openstreetmap.org link to the mosque) would fix it but opens a site that draws
     map tiles around the mosque, so it is left for the owner to decide.
   - Indonesia is the largest list and is the one left out (item 1). Fitting it needs about 2.3 MB
     saved or a bigger budget; a denser pack format (integer, delta-coded positions) gets roughly
     2 MB, not quite enough on its own.
   - The e2e "only request" check uses GB, whose nearest rows have no `name:ar`. A row with an
     Arabic name makes the page fetch the app's own Arabic font files (same origin, no position);
     keep that in mind if the test's country changes.
