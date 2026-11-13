# Licensed source texts

Kept byte-for-byte as downloaded (`.gitattributes` turns off line-ending conversion). Scripts
in `scripts/` build `src/data/` from these; nothing here is edited by hand.

| File | Source | Licence / terms |
|---|---|---|
| `tanzil/quran-uthmani.xml` | Tanzil Quran Text (Uthmani 1.1), tanzil.net, options: pause marks, sajdah, rub el hizb, superscript alef, tatweel | CC BY 3.0, verbatim only; credit Tanzil with a link (notice inside the file) |
| `tanzil/quran-uthmani-small-tanween.xml` | The same, with the small-tanween option (the per-word text) | as above |
| `quranenc/english_saheeh.csv` | Saheeh International, QuranEnc.com (`english_saheeh`, v1.1.2) | Republish unchanged, name QuranEnc and the version, keep the header |
| `clearquran/clearquran-allah-edition.txt` | The Clear Quran (Allah edition), Talal Itani, ClearQuran.com | CC BY-ND 4.0 with the author's extra permissions; credit "Translation by Talal Itani, ClearQuran.com" |

Tanzil downloads need "I agree with the Terms of Use" ticked; the owner agreed on 2026-10-16.
| `cpfair-tajweed/tajweed.hafs.uthmani-pause-sajdah.json` | Tajweed rules as character ranges, cpfair/quran-tajweed (github.com/cpfair/quran-tajweed) | CC BY 4.0; credit "Tajweed rules: cpfair/quran-tajweed" |
| `cpfair-tajweed/quran-uthmani-2017.txt` | The Tanzil Uthmani text (April 2017) those ranges index into, as published with the data | Tanzil terms (CC BY 3.0, verbatim) |
| `digitalkhatt/quran_text_indopak_15.ts` | DigitalKhatt's IndoPak text, 15-line pages (github.com/DigitalKhatt/digitalkhatt.org) | MIT (`digitalkhatt/LICENSE`); drawn in DigitalKhatt's IndoPak font, OFL 1.1 |

## Word timings (kept outside this folder)

Timing sources are large, so they live outside the repo; their output in `public/segments/` (with
`manifest.json`) is the record.

| Data | Source | Licence / terms |
|---|---|---|
| quran-align (8 EveryAyah reciters) | github.com/cpfair/quran-align, release 2016-11-24 (`Downloads/takrar-sources/quran-align`) | CC BY 4.0 |
| QUD v3.2.0 (surah-audio reciters; Ghamdi, Husary Mujawwad and Tunaiji mapped onto EveryAyah files) | Qur'anic Universal Audio, QUD Technologies (qud.dev). Upstream deleted the CC BY releases; the three mapped reciters' data and the v3.2.0 LICENSE/NOTICE are archived in `Downloads/takrar-sources/qud-v3.2.0` | CC BY 4.0 (as released at tag v3.2.0) |
| QUD v5.0.0 (Muhammad Jibreel only) | the same project, release v5.0.0 | QUA Dataset License 1.0: app free, nothing it powers gated, no ads during recitation, no public redistribution, credit "QUD Technologies - Qur'anic Universal Audio (https://qud.dev)". Never use v5 data to train or evaluate a timing model |

## All-in-one sources: one fragment and one SOURCE.md per source

Every data set or library the all-in-one features ship is recorded twice, by the package that
adds it:

- `data-sources/<source>/SOURCE.md`: URL, pinned version or commit, licence, retrieval date and
  the sha256 of each file used.
- `data-sources/licenses.d/NN-<package>.txt`: the notice that travels with it.
  `scripts/build-licenses.mjs` appends every fragment, in file-name order, to
  `public/licenses.txt`. A line `=== <title>` opens a section.

Only openly licensed sources or our own work ship. Nothing comes from Quran.com, Sunnah.com
(API or dumps), Mawaqit, an adhan recording, map tiles or a price feed (all-in-one spec 4).

| Library | Used for | Licence / terms | Fragment |
|---|---|---|---|
| `adhan` 4.4.6 (npm, github.com/batoulapps/adhan-js) | prayer times and the qibla bearing, on the device | MIT | `licenses.d/10-foundations.txt` |
| `@capacitor/geolocation` 8.2.4 (npm, github.com/ionic-team/capacitor-geolocation) | one coarse location fix in the apps, rounded, kept on the device | MIT | `licenses.d/10-foundations.txt` |

The Hijri calendar uses the platform's `Intl` Umm al-Qura calendar with our own tabular
fallback (`src/lib/hijri/convert.ts`); the method-by-country table, glossary and all English
are our own work.
