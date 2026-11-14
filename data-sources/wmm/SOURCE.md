# World Magnetic Model 2025 (WMM2025)

Used by the qibla compass (`src/lib/qibla/declination.ts`) to turn Android's magnetic heading
into a true-north heading. iOS reports true north itself.

| | |
|---|---|
| Publisher | NOAA National Centers for Environmental Information (NCEI) and the British Geological Survey |
| Page | https://www.ncei.noaa.gov/products/world-magnetic-model |
| Model | WMM-2025, epoch 2025.0, header dated 11/13/2024; valid 2025.0 to 2030.0 |
| Licence | Public domain (a work of the US government). NOAA asks only that it is credited, which `licenses.d/30-wmm.txt` does |
| Retrieved | 2026-11-13 |

## Files

| File | From | sha256 |
|---|---|---|
| `WMM2025.COF` | `WMM.COF` in https://www.ncei.noaa.gov/sites/default/files/2024-12/WMM2025COF.zip (zip sha256 `2e76569370d081f2cd7919490218bd094ca9afde347b198eff5621e0af460d03`); identical to `WMM2025.COF` in the same zip | `dfa8597825af4e0b87ff4198a5b4fb661b3c49f4cd090cd0164e0259b075582f` |
| `WMM2025_TestValues.txt` | `WMM2025_TestValues.txt` in the same zip: 100 points, 2025.0 to 2029.5, 0 to 100 km | `e6975b093dddeb6153e0b23cc418425c438167e7c5b1dd795da379cb654f5819` |
| `WMM2025_TEST_VALUES_web.txt` | https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt (12 points with X, Y, Z) | `ae289c94e2200e4deeae2dfdedf543a8a0e93096512b30d6a754199731f570d0` |

## Pipeline

`node data-sources/wmm/build-wmm.mjs` writes `src/lib/qibla/wmm2025.ts` from `WMM2025.COF`
(`--check` compares without writing). `src/lib/qibla/declination.test.ts` also checks the module
against the `.COF` line by line, and checks our evaluation against all 112 NOAA test values
(declination within 0.02 degrees, field components within a fraction of a nanotesla).

## Renewal

WMM2030 is due in December 2029. After 2030.0 the app keeps extrapolating for two more years
(the error grows by roughly a tenth of a degree a year), then stops correcting and labels the
Android heading "magnetic". To renew: replace `WMM2025.COF` and the test files with the new
release, update this file, run the build script, and adjust the file names in the test.
