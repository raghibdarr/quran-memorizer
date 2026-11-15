# HANDOFF: qibla

Needs in shared files (spec 9.4). The package builds and passes without them.

1. **`data-sources/README.md`** (foundations-owned), "All-in-one sources" table: add a row
   - Library/data: World Magnetic Model WMM2025 (NOAA NCEI and British Geological Survey), coefficients pinned in `data-sources/wmm/` (see its SOURCE.md)
   - Used for: correcting the phone's magnetic compass heading (Android and iOS) to true north on the qibla screen, on the device
   - Licence / terms: public domain (US government work); credited
   - Fragment: `licenses.d/30-wmm.txt`

   Why: every all-in-one source is recorded in the README as well as in its SOURCE.md and fragment.

2. **Integration**: regenerate `public/licenses.txt` so `licenses.d/30-wmm.txt` is included.
