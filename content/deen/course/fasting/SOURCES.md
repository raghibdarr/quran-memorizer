# Unit Fasting: sources and how they were read

Retrieved 2026-11-13. Every source below was read online to locate wording; none is bundled.
The 16-character values are the first half of the sha256 of the normalised skeleton
(`arabicSkeleton` in `scripts/build-deen.mjs`) of the pages read, so a later check can tell
whether the online copy has changed.

## Primers (school positions: `positions[].source` and `quote`)

| Work (id) | Online copy read | Pages | Skeleton sha256/16 |
|---|---|---|---|
| Mukhtasar al-Quduri (`mukhtasar-al-quduri`), Kitab al-Sawm | shamela.ws/book/124336, ed. Kamil Muhammad Uwayda, Dar al-Kutub al-Ilmiyya | /52 to /54 (print pp. 62-64) | 4e8a8bb16d57926d |
| the same, second copy | shamela.ws/book/985, the matn printed in al-Tashih wa al-Tarjih | /189 to /192 (print pp. 204-207) | 278b02422556f0b1 |
| al-Risala (`al-risala`), Bab fi al-Siyam | shamela.ws/book/11373, Dar al-Fikr | /73 to /77 (print pp. 59-63) | 0695d05423d8aca6 |
| Matn Abi Shuja' (`matn-abi-shuja`), Kitab al-Sawm | shamela.ws/book/11370, Alam al-Kutub | /19 to /20 (print pp. 18-19) | 192f9c21f9d35738 |
| 'Umdat al-Fiqh (`umdat-al-fiqh`), Kitab al-Siyam | shamela.ws/book/11315, ed. Ahmad Muhammad Azzuz, al-Maktaba al-Asriyya 1425/2004 | /54 to /59 (print pp. 41-43) | cd2d283554cd4a54 |

The two copies of al-Quduri differ in small ways (for example `زاد مرضه` / `ازداد مرضه`,
`فإن أخره` / `وإن أخره`), and the first copy has typing slips (`بينة` for `بنية`,
`والحامل والمريض` for `والحامل والمرضع`) and drops the end of the sentence on a daytime
intention. Each Hanafi quote follows whichever copy has the sentence whole; `review.log`
says which copy each quote was found in. The other three primers were read in one copy each.

The copy of 'Umdat al-Fiqh has `العاجر` for `العاجز`; the quote starts after that word.

## Agreement and difference

| Work (id) | Online copy read | Where |
|---|---|---|
| Bidayat al-Mujtahid (`bidayat-al-mujtahid`), Kitab al-Siyam and Kitab al-Siyam al-thani | shamela.ws/book/21739, Dar al-Hadith, Cairo 2004 | /291 to /321 (vol. 2 pp. 45-75) |
| al-Ijma' of Ibn al-Mundhir (`al-ijma`) | shamela.ws/book/12445, ed. Fu'ad Abd al-Mun'im Ahmad, Dar al-Muslim 1425/2004 | /40 (no. 68), /48 to /49 (nos. 123-129). The numbers are this edition's. |

## Hadith (evidence items)

| Item | Citation | Witness 1 | Witness 2 | Grading located |
|---|---|---|---|---|
| `iftar-dhahaba-al-zama` | Abu Dawud 2357 (variant: 2358), Muhyi al-Din Abd al-Hamid's numbering | shamela.ws/book/1726/3158 and /3159 (vol. 2 p. 306) | hadith-api `ara-abudawud` 2357, 2358 | al-Daraqutni, Sunan, after no. 2279: shamela.ws/book/9771/2240 (Mu'assasat al-Risala 2004, vol. 3 p. 156). Al-Nawawi's "mursal" remark: al-Adhkar, bab ma yaqul 'inda al-iftar, no. 986 in the OpenITI text `0676Nawawi.Adhkar.Shamela0010639`. |
| `forgetful-eater` | al-Bukhari 1933, Fath al-Bari numbering | dorar.net hadith encyclopedia (Sahih al-Bukhari, 1933) | hadith-api `ara-bukhari` 1933 | in the Sahih |
| `fasting-is-a-shield` | al-Bukhari 1894, Fath al-Bari numbering | dorar.net hadith encyclopedia (Sahih al-Bukhari, 1894) | hadith-api `ara-bukhari` 1894 | in the Sahih |

A third witness was added for the two al-Bukhari items on 2026-11-14: the Shamela copy of the
Sultaniyya print, shamela.ws/book/1681/3024 (no. 1894) and /3084 (no. 1933). The dorar.net
pages could not be downloaded again that day; see `review.log` section 8.

Check the evidence items with `node content/deen/course/fasting/check-evidence.mjs`.

## Left out, and why

- Cupping while fasting: the primers differ, but showing the difference fairly needs two
  hadith, one of which is outside the two Sahihs and has no grading located yet.
- The Hanbali position on when the intention is made: the copy of 'Umdat al-Fiqh read has
  no sentence on it, so the claim shows two schools and says so.
- The Shafi'i position on delaying make-up days and on which is better for a traveller: Matn
  Abi Shuja' is silent on both.
- Injections, inhalers, drops and other modern questions: out of scope. Lesson 3 says to ask
  a scholar you trust.
- Amounts of fidya in today's measures or money: never computed. The primers' own words
  (a mudd, feeding a poor person) are shown.
