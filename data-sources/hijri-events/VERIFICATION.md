# Hijri occasions: content verification (2026-11-14)

Independent check of `src/data/hijri-events.json` and the religious copy on `/calendar` and
`/ramadan`. The package ships no Arabic, no hadith text and no translation, so the check is
that each one-line description is supported by a located text. Witness used for collation:
the open hadith-api Arabic editions (fawazahmed0/hadith-api@1, read 2026-11-14). sunnah.com
and dorar.net refused automated requests, so no second independent witness was reached.
For that reason every `citation` stays empty (spec 5.1 needs two witnesses, one not
Sunnah.com-derived). The leads below are for the citation stage, not shipped text.

| Event | Supported by (lead, one witness) | Result |
|---|---|---|
| ramadan | Quran 2:183-185 (resolves in bundled surah 2) | ok |
| last-ten-nights | Quran 97:1-5 (resolves); Bukhari 2017, 2020 "تحروا ليلة القدر في العشر الأواخر من رمضان" | ok |
| eid-al-fitr, eid-al-adha | Bukhari 1991 (no fasting on the two Eid days) | ok |
| six-shawwal | Muslim 1164 (Abd al-Baqi) "من صام رمضان ثم أتبعه ستا من شوال" | description changed, see below |
| dhul-hijjah-ten | Bukhari 969 "ما العمل في أيام العشر أفضل من العمل في هذه" | ok |
| arafah | Muslim 1162 (fast of Arafah); Muslim 1123 (the Prophet ﷺ did not fast it at Arafah) | ok |
| tashriq | Muslim 1141 "أيام التشريق أيام أكل وشرب" with the added "وذكر لله" | ok |
| tasua | Muslim 1134 "لئن بقيت إلى قابل لأصومن التاسع" | ok |
| ashura | Muslim 1162 | ok |
| white-days | Tirmidhi 761, Nasa'i 2420, 2422 (13th, 14th, 15th) | ok |
| mon-thu | Tirmidhi 745, 747; Muslim 1162 (Monday) | ok; weekdays [1,4] = Monday, Thursday |

## Changed

- **six-shawwal**: the schools differ and the line showed one side only. Now: "Recommended by
  al-Shafi'i and Ahmad; Malik and Abu Hanifa disliked them." Basis: al-Nawawi, quoted as
  "وقال مالك وأبو حنيفة: يكره صومها" with the recommendation attributed to al-Shafi'i, Ahmad
  and Dawud; Ibn Qudama "وبه قال الشافعي، وكرهه مالك"; Malik's own words in the Muwatta
  (Book of Fasting), "لم ير أحدا من أهل العلم والفقه يصومها". These were read through a
  secondary page quoting them (midad.com/article/216142), not from the printed works; the
  content audit should confirm al-Majmu' and al-Mughni locations.
- **Sighting explainer**: removed "long-held" from "different, long-held positions". The three
  positions are stated neutrally, but equal antiquity for calculation was an unsupported claim.

## Left as is, for the audit to weigh

- white-days: the Maliki school is reported to dislike fixing the three monthly fasts to the
  13th-15th. Not verified in a primary text here, so nothing was added.
- No gradings are shown anywhere in this package, so there is nothing to attribute.
- "Exempt" on the fasting log makes no ruling (who is exempt is not stated), and the make-up card
  says fidya and kaffara are not worked out. No change.
