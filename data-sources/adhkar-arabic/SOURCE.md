# Adhkar and duas: Arabic and gradings

- **What**: the Arabic of the adhkar and duas, one file per item in
  `content/deen/adhkar/<deck>/items/*.json`, emitted to `src/data/deen/<deck>.json` by
  `node scripts/build-deen.mjs --deck <deck>`.
- **Origin**: hadith from Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud, Jami' al-Tirmidhi
  and Sunan Ibn Majah, classical works in the public domain. Our transcription, vowelling and
  English translation are Takrar's own work. Quranic items store only a reference.
- **Licence**: public domain text; our own work otherwise. Listed in
  `data-sources/licenses.d/55-adhkar.txt`.
- **Retrieved / collated**: 2026-11-14 to 2026-11-15. Nothing is bundled from any website; pages
  were read one at a time for collation, and none of their text is stored in the repository.

## Witnesses (read for collation only)

| Id | Witness | Derived from Sunnah.com? |
|---|---|---|
| `shamela` | al-Maktaba al-Shamila copies of the printed editions whose numbering the citations name: al-Bukhari, al-Sultaniyya print with Fath al-Bari numbering (book 1681); Muslim, ed. Abd al-Baqi (1727); Abu Dawud, ed. Muhyi al-Din Abd al-Hamid (1726); al-Tirmidhi, ed. Ahmad Shakir and others (1435); Ibn Majah, ed. Abd al-Baqi (1198) | no |
| `hadith-api` | fawazahmed0/hadith-api, `ara-*` editions (comparison only) | yes |

Each item records both witnesses with the page read and the sha256 of the consonantal
skeleton (`arabicSkeleton` in `scripts/build-deen.mjs`) of the witness's reading. Where the two
read differently, the item's `provenance.note` says which reading we follow (always the printed
edition) and the witness's own hash is kept.

## Tools

- `content/deen/adhkar/tools/witness.mjs locate <collection> <n>`: prints a hadith as both
  witnesses give it. `verify [deck] [--all]`: every cited number holds the item's Arabic (and
  each variant's) in both witnesses, or in one with a recorded variant note (stage G).
- `content/deen/adhkar/tools/seal.mjs [deck] [--write]`: stage C (skeleton collation and
  hashes) and stage D (word-by-word vowelling comparison with the vocalised witnesses).
- `content/deen/adhkar/tools/batch-locate.mjs`: `locate` for many numbers at once.

## Gradings

- al-Tirmidhi's verdicts are read after each hadith in the Shamela copy of his Jami'.
- al-Nawawi, al-Adhkar, ed. Abd al-Qadir al-Arna'ut, on shamela.ws (book 1956): numbers 71,
  159, 192, 217 and 545 (his remark that "Allahumma laka sumtu" is mursal). Only al-Nawawi's
  own words are quoted, never the editor's notes.
- al-Daraqutni, Sunan, after hadith 2279 (al-Risala numbering), read on en.tohed.com: one copy
  only, recorded as such in the item's review log.
