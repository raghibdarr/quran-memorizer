---
name: V2 Roadmap & Future Ideas
description: All planned V2 features discussed across conversations — voice recognition, scalability, curriculum structure, audio improvements, and more
type: project
---

## Curriculum & Scalability

- **Lesson splitting for long surahs**: Each lesson should be ~3-5 ayahs. Short surahs (Juz Amma) = 1 lesson. Long surahs (Al-Baqarah = 286 ayahs) split into ~95 lessons.
- **Juz / Hizb / Rub al-Hizb structure**: Traditional memorization divisions. Navigation: Juz → Surah → Lessons. Progress tracking at juz level.
- **Rub al-hizb as lesson size for longer surahs**: ~half page to a page, natural memorization unit.
- **Expand beyond 8 MVP surahs**: Transliteration scraper (quran411.com) and data fetch scripts already scale to all 114 surahs.
- **Surah detail page**: Show lesson list within a surah when it has multiple lessons.

## Voice Recognition (Tier 2 — Whisper)

- **Approach**: "Record & Check" — user records recitation, sent to backend, Whisper transcribes, compare against expected text, highlight matches/mistakes.
- **Model**: Tarteel's open-source fine-tuned Whisper model on HuggingFace (Apache 2.0). ~5.75% WER on Quran recitation.
- **Hosting**: HuggingFace Inference API or Replicate. ~$0.006-0.01 per request.
- **Scope**: Works well for short ayahs (Juz Amma). Constrained verification (known expected text) is much easier than open-ended recognition.
- **UX**: "Record & Check" button in Build and Test phases. Level 3 (full recall) test is the ideal place for voice validation — user recites, then instead of self-assessment, the app verifies automatically. 2-3 second processing delay. Highlight which words matched/didn't.
- **Cost scaling**: Linear with usage (number of recordings), not with content. Rate-limit or make premium if needed.
- **Backend requirement**: Need a backend/serverless function for this. Supabase (already planned for V2 auth) could host the API route.

## Auth & Sync (Supabase)

- **V1 is fully local** (localStorage + IndexedDB). No auth needed.
- **V2**: Bolt on Supabase for optional auth + cross-device sync.
- **User already knows Supabase** from QuranTracker project.
- **Sync**: Progress, review cards, settings, stats.

## Audio Improvements

- **Word-by-word highlighting during playback**: Requires word timing data from quran.com API (available for some reciters). Sync audio position to highlight each word as it's recited.
- **Multiple reciters**: Currently only Mishary Alafasy. Could add Al-Hussary (recommended for beginners — slower pace), Abdul Basit, etc. everyayah.com has many reciters.
- **Audio scrubbing/seeking**: Proper seek bar for audio playback.

## Transliteration

- **Programmatic waqf transformation**: For scaling beyond manually-scraped quran411 data. Rules for verse-ending vowel changes are systematic and automatable for ~90% of cases.
- **Simplified transliteration style**: Remove scholarly diacritics (ḥ→h, ṣ→s, ʿ→') for beginner-friendliness.

## Offline / PWA

- **Service worker**: Cache all static JSON, audio for downloaded surahs, app shell.
- **Next.js PWA plugin**: next-pwa or @ducanh2912/next-pwa.
- **Users should be able to do lessons and reviews without internet.**

## Monetization (think about later)

- **Freemium**: First 3 surahs free, unlock full Juz Amma for one-time £5-10.
- **Tip jar / Sadaqah model**: "If this helped you, support the project."
- **Premium features**: Advanced analytics, custom revision schedules, multiple reciters, voice recognition.
- **Audience prefers one-time purchases over subscriptions for religious content.**

## UX Ideas from Reddit Research

- **Recording yourself and playing back** (technique #2): Could tie into voice recognition.
- **Writing out verses** (technique #15): Digital whiteboard mode where user traces/writes Arabic letters.
- **Similar passage tracker** (technique #17): Flag verses that resemble each other across surahs to avoid confusion.
- **Use in prayers prompt** (technique #25): After completing a surah, suggest "Recite this in your next prayer."
- **Multiple repetition patterns**: Currently using 6-4-4-6. Could offer 10/10, 3x3, or 20x (Madinah method) as options in settings.

## External Resources (Tarteel QUL — Primary Data Source for V2)

Tarteel's Quranic Universal Library (qul.tarteel.ai/resources) is a comprehensive open-source resource that could replace most of our current data sources:

- **Quran metadata** (`/resources/quran-metadata`): Division points for rub, hizb, juz, manzil, page numbers. Essential for scaling to full Quran with proper juz/hizb navigation.
- **Quran scripts** (`/resources/quran-script`): Multiple script styles including Uthmani, IndoPak Nastaleeq, etc. as JSON/SQLite. Could replace our quran.com API fetch for text data.
- **Fonts** (`/resources/font`): Purpose-built Quranic fonts for each script style. Currently using their IndoPak Nastaleeq font (self-hosted woff2). Should evaluate their other fonts vs Amiri for Uthmani rendering.
- **Recitations** (`/resources/recitation`): Multiple reciters with audio. Could replace everyayah.com as audio source and enable the multi-reciter feature.
- **Transliteration** (`/resources/transliteration`): Structured transliteration data as JSON/SQLite. Could replace our quran411.com scraping approach — more reliable and scalable to all 114 surahs.
- **Mushaf layouts** (`/resources/mushaf-layout`): Full page layouts for mushaf-style rendering. Useful for a "view surah" reference mode.

**Why:** Currently we pull from 3 separate sources (quran.com API, everyayah.com, quran411.com scraping). Tarteel QUL consolidates all of this into one open-source platform with downloadable JSON/SQLite. More reliable, no scraping, proper data formats.

**How to apply:** When scaling beyond MVP, migrate data pipeline to use QUL downloads instead of multiple API calls + scraping. Download once, store as static JSON (same pattern we use now).

## Technical Debt

- **React Native migration path**: Business logic (Zustand stores, SM-2, lesson progression) copies directly. Components need JSX rewrite (div→View). Audio → expo-av. Storage → expo-sqlite.
- **Shared /lib or /core folder**: Keep pure logic with zero React dependencies for portability.
