# Names of Allah: independent content audit

2026-11-15, by a fresh agent that wrote none of the deck. Nothing was removed; seven items
and the intro card were corrected. These fixes were made before the deck reached users, so
they are recorded here and in each item's `review.log`, not in `content/deen/ERRATA.md`.

## What was checked, and against what

- **The list (Arabic, order, vocalisation), all 99 items.** Collated mechanically against
  al-Tirmidhi 3507 in two witnesses: the dorar.net hadith encyclopedia entry for
  al-Tirmidhi 3507 (plain text) and the hadith-api Arabic edition (vocalised). Names 2 to 99
  match both in skeleton and order; the vocalisation of every word matches the vocalised
  witness (differences are orthographic only: alif wasla, dagger alif, sukun). The first
  item, Allah, is the hadith's "huwa Allah alladhi la ilaha illa huwa".
- **Quran evidence, 89 ayat.** Every cited ayah was re-read in the bundled Tanzil text and
  each meaning and explanation compared with it. `check-names.mjs` and guardrail 6 are green.
- **Muslim 771 (items 071, 072).** The words "anta al-muqaddim wa-anta al-mu'akhkhir" are
  in Muslim 771 (Abd al-Baqi) from 'Ali ibn Abi Talib, said between the tashahhud and the
  salam: sunnah.com page view (771a) and dorar.net takhrij ("Muslim (771)", narrator 'Ali).
- **Intro card citations.** Al-Bukhari 2736, Muslim 2677 and al-Tirmidhi 3507 confirmed on
  dorar.net (takhrij lines) and in sunnah.com page views. Both wordings ("man ahsaha",
  "man hafizaha" / "la yahfazuha ahad") are in the two Sahihs; neither lists the Names.
- **Al-Tirmidhi's remark.** "Hadha hadithun gharib, haddathana bihi ghayru wahid 'an Safwan
  ibn Salih, wa-la na'rifuhu illa min hadith Safwan ibn Salih": read in the Jami' text and in
  Ibn Kathir's quotation of it.
- **Ibn Kathir on 7:180** (quran.ksu.edu.sa): "wa-lladhi 'awwala 'alayhi jama'atun min
  al-huffaz anna sard al-asma' fi hadha al-hadith mudraj fih".
- **Ibn Hajar, Fath al-Bari, Book of Supplications.** Read only as quoted (Fath 11/215) in a
  later study hosted on shamela.ws, not in a copy of the Fath: scholars differed whether the
  list is the Prophet's words or a narrator's insertion; many went with the first; others
  held it inserted because most routes lack it. **Still to do:** confirm this sentence in a
  copy of Fath al-Bari itself.

## What was changed

| Item | Was | Now | Why |
|---|---|---|---|
| Intro, paragraph 2 | "gharib: it reached him by a single route. Many hadith scholars, among them Ibn Hajar and Ibn Kathir, judged that the list was added by a narrator" | names the one narrator (Safwan ibn Salih); says scholars differ, with Ibn Hajar's report of both views and Ibn Kathir's sentence | al-Tirmidhi heard it from several people, all from Safwan; Ibn Hajar records that many took the list as the Prophet's words, so the old wording showed one side only |
| 026 al-Mudhill | "in Your hand is all good" | "in Your hand is the good" | "all" is not in 3:26 |
| 040 al-Muqit | meaning and explanation gave only "nourisher" | keeper, witness, able (al-Tabari prefers able), related to qut; source al-Tabari on 4:85 | al-Tabari reports several early readings of the word in 4:85 and prefers "able" |
| 071, 072 | "the Prophet's supplication" | adds ﷺ | STYLE.md |
| 077 al-Wali | read as if 13:11 used the word of Allah | says the ayah denies any other protector | the word in 13:11 is negated of others, not said of Allah directly |
| 081 al-Muntaqim | "requite the wrongdoers" | "take requital from the guilty" | 32:22 says al-mujrimin |
| 085 Dhu'l-Jalal wa'l-Ikram | quoted 55:26-27 but cited 55:27 | cites 55:26-27 | the first clause is 55:26 |

## Left as it is, for the owner to know

- The transliteration scheme writes both hamza and 'ayn as an apostrophe, so 074 reads
  "Al-'Aakhir". It is the house scheme's output, not a content error.
- The eight `list-only` Names say "not as a Name in the Quran". That is what was checked.
  Whether any of them is named in a sound hadith outside the list was not searched
  exhaustively.
- No scholar has reviewed the deck. Status stays `source-checked`.
