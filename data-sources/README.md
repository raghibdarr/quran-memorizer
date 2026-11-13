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
