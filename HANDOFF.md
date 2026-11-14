# HANDOFF: prayer-times

Needs in shared files (spec 9.4). The package builds and passes without them.

1. **data-sources/README.md** (foundations-owned): add a row to the all-in-one sources table:
   `| GeoNames cities15000 (download.geonames.org, retrieved 2026-11-13) | city search, place label after a location fix, the place's time zone | CC BY 4.0 | licenses.d/20-geonames.txt |`
   and note that the zip is archived outside the repo at `Downloads/takrar-sources/geonames/cities15000.zip`
   (sha256 in `data-sources/geonames/SOURCE.md`). Owner's call whether to commit the 3.3 MB zip instead.
2. **Integration:** regenerate `public/licenses.txt` (picks up `data-sources/licenses.d/20-geonames.txt`).
3. **Playwright:** `e2e/prayer-times.spec.ts` (12 tests) passed against this worktree's static build. Its offline test
   swaps the host to 127.0.0.1 (the service worker is unregistered on localhost) and skips under the dev server.
4. **Local builds in a worktree:** Turbopack refuses the node_modules junction; `npx next build --webpack` works.
   Without a `.env.local` the app needs `NEXT_PUBLIC_SUPABASE_URL` set to anything (a dummy local URL was used here).
5. `src/components/prayer/tool-tiles.tsx` is unchanged; the hub renders it (readyTools()).
