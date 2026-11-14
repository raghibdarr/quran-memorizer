# Hadith Arabic: al-Nawawi's Forty

- **What**: the Arabic of al-Arba'in al-Nawawiyya (al-Nawawi, d. 676 AH), one file per
  narration in `content/deen/nawawi40/items/NN.json`, emitted to `src/data/deen/nawawi40.json`
  by `node scripts/build-deen.mjs --deck nawawi40`.
- **Origin**: a classical work in the public domain. The text is transcribed, vowelled,
  punctuated and divided into learning segments by Takrar. Nothing was bulk-downloaded or
  bundled from any website, dump or API.
- **Licence**: the classical text is public domain; our transcription, vowelling and English
  translation are Takrar's own work. Listed in `data-sources/licenses.d/50-hadith.txt`.
- **Retrieved / collated**: 2026-11-14.

## Witnesses (read for collation only)

Each item lists the witnesses it was collated against in `provenance.witnesses`, with the page
it was read on. Pages were read one at a time; none of their text is stored in the repository.

| Id | Witness | Derived from Sunnah.com? |
|---|---|---|
| `ibn-daqiq-sharh` | Ibn Daqiq al-'Id (d. 702), *Sharh al-Arba'in al-Nawawiyya*, Mu'assasat al-Rayyan, 6th printing 1424/2003, on shamela.ws (book 11244). Unvowelled. | no |
| `haytami-fath-al-mubin` | Ibn Hajar al-Haytami (d. 974), *al-Fath al-Mubin bi-Sharh al-Arba'in*, Dar al-Minhaj, Jeddah, 1st printing 1428/2008, on shamela.ws (book 8889). Fully vowelled matn. | no |
| `hadith-api` | fawazahmed0/hadith-api, edition `ara-nawawi` (comparison only). Vowelled. | yes |

Citation numbers and gradings were confirmed in two further places: the takhrij footnotes of
al-Haytami's editors (Dar al-Minhaj) and of Ibn Rajab's *Jami' al-'Ulum wa al-Hikam*, ed.
Shu'ayb al-Arna'ut and Ibrahim Bajis, Mu'assasat al-Risala, 7th printing 1417/1997, on
shamela.ws (book 4268). The hadith-api editions of the six books were used to compare the text
at each number, never as data.

## How the skeleton hashes are made

`content/deen/nawawi40/tools/collate.mjs` re-reads each witness, finds the item's span (from
al-Nawawi's opening "عن …" to the end of the narration, before his attribution line such as
"رواه البخاري ومسلم", which becomes the item's `citations`), and hashes its consonantal
skeleton with `arabicSkeleton` from `scripts/build-deen.mjs`, with one declared extra step:
honorific formulas are written as we print them, because prints differ in them only by house
style:

- صلى الله [تعالى] عليه [وعلى آله] وسلم → ﷺ
- رضي الله تعالى عنه / عنها / عنهما / عنهم → رضي الله عنه / عنها / عنهما / عنهم

Every other difference stays in the hash. Where a witness differs from ours, the item's
`provenance.note` names each difference and the reading chosen. Our reading follows at least
two of the three witnesses at every point.

Vowelling is ours and is compared word by word with the vowelled witnesses
(`collate.mjs --vowels`); conflicts are settled in the item's note or review log.

To re-run: `node content/deen/nawawi40/tools/collate.mjs [ids] --vowels` (fetches the witness
pages politely into a cache outside the repository; `NAWAWI_CACHE` sets where).
