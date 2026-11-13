# Deen content: house style

Applies to every authored item under `content/deen/` (hadith, adhkar, duas, Names, course).
`scripts/build-deen.mjs --check` enforces what can be checked by machine; the rest is on the
translator and the back-checker (spec 5.4, stages E and F).

## English translation

- Plain modern English, sentence for sentence with the Arabic. One Arabic sentence, one
  English sentence, in the same order.
- Translate from the Arabic only. Do not open Darussalam, Muhsin Khan, Khattab, Sunnah.com's
  English or Qahtani's English while translating or checking.
- "Allah", never "God", for الله.
- After the Prophet's name or title write the glyph ﷺ, once per mention.
- Words supplied for sense, absent from the Arabic, go in square brackets: "he [the man] said".
  Keep them few.
- No commentary inside a translation. Explanation goes in a note.
- Keep the narrator's frame ("It was narrated from …", "He said: …") when the Arabic has it.
- Length: between 0.6x and 2.5x the Arabic word count (the build checks this).

## Notes

- At most three notes per item.
- Each note is an attributed paraphrase: who said it, in which work, where in it
  (`source: { work, location }`). Never our own opinion.

## Arabic terms

- An Arabic term kept in English is written `[[term-id]]` and must resolve in a glossary
  (`content/deen/glossary/core.json` or the package's own `glossary/<package>.json`).
- If a glossary term's transliteration appears unmarked, the build warns: mark it, or use
  plain English instead.
- Prefer plain English where it carries the meaning ("the prayer", "ablution" only when the
  term would confuse; `[[wudu]]` is usually clearer).

## Arabic text

- Unicode NFC, Arabic letters and marks only: no tatweel, no Latin letters, no digits.
- Hadith and dhikr Arabic is our own transcription of public-domain texts, collated against
  two witnesses (spec 5.1). Each witness records the sha256 of the normalised skeleton
  (`src/lib/deen/normalize-arabic.ts`). If witnesses differ, `provenance.note` says which
  reading was chosen and why.
- Quranic text is never stored: an item quoting the Quran sets `quran: { surahId, ayah }`
  and the app renders the ayah from the surah files.
- Segments (`segments`) end at sentence ends only.

## Transliteration

- One house scheme: `src/lib/transliterate.ts`, run on fully vocalised text. Do not hand-write
  transliteration for vocalised Arabic.

## Citations and gradings

- Cite by collection and number with the numbering scheme named (`collections.json`). A
  number from any design document or brief is a lead, never data: confirm it in two
  witnesses first.
- Gradings are attributed: `{ grade, by, in, quote }`, shown as "Hasan: al-Tirmidhi, in the
  Jami' after the hadith". A verdict that cannot be located is deleted, never softened.

## Fiqh (course)

- Rulings live only in claims, never in a lesson's intro (at most 60 words, no ruling words).
- Where the four schools differ, each position is data with its source. No winner is picked.
- Never write "the correct opinion", "the strongest view", or "scholars agree" without a
  consensus citation.
- Every lesson ends with: "For your own situation, ask a scholar you trust."

## Status

- `draft` until stages A to I pass; `source-checked` after; `scholar-reviewed` only when a
  named reviewer in `reviewers.json` has reviewed it. Nothing is labelled scholar-reviewed
  by an agent.
