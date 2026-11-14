# GeoNames cities15000

| | |
|---|---|
| Data | All cities with a population over 15,000, or a capital (GeoNames gazetteer extract) |
| URL | https://download.geonames.org/export/dump/cities15000.zip |
| Version | GeoNames publishes the dump daily, so the archived download below is the pin: `cities15000.txt` dated 2026-11-13 03:37 inside the zip |
| Retrieved: 2026-11-13 | |
| sha256 (cities15000.zip) | `50ef2f0cf7a1dd6d67123aaa6cdd45a8cf48ff5d23b3677e896f009ccce768d7` |
| Licence | Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit: "Place names and positions: GeoNames (geonames.org), CC BY 4.0" |
| Kept at | `Downloads/takrar-sources/geonames/cities15000.zip` (outside the repo, with GeoNames' readme.txt) |
| Built by | `node scripts/build-cities.mjs` → `public/data/cities.json` |

## What ships

Only five fields per place: name, country code, latitude and longitude (rounded to 2 decimal
places), and IANA time zone, most populous first. Where GeoNames' ASCII name differs from the
name with its accents removed, the ASCII name is kept too, for search. For the United States
only, the admin1 code (the two-letter state code) is kept as well, so search results can show
the state for towns that share a name; the state names themselves are our own table in
`src/lib/prayer/cities.ts`. Alternate names, populations, other admin codes and ids are dropped.

## Changes we made

Trimmed and re-shaped (columnar JSON) only. No place is added, renamed or moved. Search
aliases such as "Mecca" for GeoNames' "Makkah" live in `src/lib/prayer/cities.ts` (our own
work), not in this file.

## Used for

City search on `/prayer/setup` and `/prayer/settings`, the place label after a "Use my
location" fix (nearest bundled city, worked out on the device), and the place's country and
time zone. The file is fetched from the app's own bundle on those screens only.
