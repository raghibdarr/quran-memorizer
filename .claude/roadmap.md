# Takrar Roadmap

Last updated: 2026-03-29

---

## Completed

- [x] Lesson splitting & Juz 30 expansion (37 surahs, ~5 ayah lessons)
- [x] Spaced repetition review UI (SM-2 card flow with per-ayah rating)
- [x] Review page redesign (due cards, surah-focused review, single-lesson review)
- [x] Supabase auth (Google OAuth, email/password, magic link)
- [x] Cloud sync (offline-first with per-store merge)
- [x] Logo redesign & theme-aware variants
- [x] Lesson-level review cards (SM-2 scheduling per lesson)

---

## P0 — Ship ASAP

### PWA / Offline Support
- Service worker + web manifest
- Offline fallback page
- Audio already cached via IndexedDB — this is mostly config
- **Why**: App store review takes months; PWA is the stop-gap for mobile users

### Fix Streak & Daily Goal
- Audit streak tracking — may be broken (stuck on 5)
- Clear label: "5 day streak" not just a number + flame icon
- Define what counts as a "day" (any lesson or review activity?)
- Daily goal progress indicator on home page (e.g., "2/3 lessons today")

---

## P1 — Core UX Polish

### Onboarding Flow
- Welcome screen → 3-4 swipeable cards explaining Listen → Understand → Memorize → Test → Review
- Pick first surah → drop into lesson
- One-time, dismissible

### Progress Page Revamp
- Calendar heatmap (days colored by activity — lessons, reviews)
- Streak + total stats (ayahs memorized, lessons completed, total reviews)
- Timeline chart (cumulative progress over time, like Quran Tracker)
- Remove surah cards (that's the review tab's job now)
- Review tab shows ALL completed lessons (green/yellow/red), not just problematic ones

### Simplify Terminology
- Kill the word "practice" from UI entirely
- Two verbs only: **Learn** (5-phase lesson flow) and **Review** (spaced repetition)
- Home page: "Continue learning" / Review tab: "X lessons to review"

### Chunk Phase Polish
- One-time tooltip overlay explaining the 6-4-4-6 pattern on first entry
- Allow replay beyond the minimum — once they hit 6, show "completed (tap to replay)" instead of locking
- Don't offer customization yet — default is pedagogically sound, avoid decision paralysis

---

## P2 — Feature Expansion

### Understand Phase Refinement
- "Tap to reveal" translation instead of auto-showing everything
- No quiz gate, no pass/fail — just a moment of reflection
- Users who don't care swipe through in 5 seconds

### Hifdh Mode / Curriculum Planner
- Goal setting: "Memorize Juz 30 by Ramadan" or "2 new lessons per week"
- Smart scheduling: daily plan generated from goal + pace ("Today: Learn An-Naba L4, Review 3 due")
- Adaptive: falls behind → plan adjusts, ahead → accelerates
- Integrated, not separate — users with a goal see "Today's Plan", users without see surah grid
- Layer on top of existing SM-2 review system

### Duas / Dhikr / Essentials Section
- Duas: witr, daily adhkar, salah duas, travel duas
- Dhikr: tasbih sequences, prayer bead sequences
- Key ayahs: Ayatul Kursi, last 2 of Al-Baqarah, Surah Mulk
- Simpler flow than full lessons: listen → repeat → self-test
- Separate "Essentials" or "Collections" section within the app

---

## P3 — Social & Gamification

### Calendar Heatmap (local first)
- GitHub-contributions-style grid on progress page
- Colored by daily activity (lessons + reviews)
- No backend needed — uses local data

### Activity Feed + Friends
- Chronological feed: "Raghi completed Al-Ikhlas L2", "Sara reviewed 5 lessons"
- Milestones: "Raghi finished memorizing Surah An-Naba"
- Privacy: opt-in (some users memorize privately)
- Needs Supabase tables: friendships, activity_events

### Leaderboard + Groups (StepUp-style)
- Daily/weekly/monthly rankings
- Metrics: lessons completed, review streak, ayahs memorized
- Create/join multiple groups (halaqah, family, friends)
- Needs Supabase tables: groups, group_members, leaderboard views

### Unit Tests
- Targeted tests for pure functions: processReview, processLessonReview, generateLessonsWithJuzBoundaries
- SM-2 math bugs are silent and only surface weeks later
- Skip UI component tests for now

---

## Future / Native App

- Voice recognition: whisper-large-v3 on-device (browser limited to whisper-base)
- Push notifications for review reminders
- Widgets (daily ayah, streak)
- App Store / Play Store distribution
- React Native migration path: business logic (Zustand stores, SM-2, lesson progression) copies directly. Components need JSX rewrite (div→View). Audio → expo-av. Storage → expo-sqlite. Keep /lib with zero React deps for portability.

---

## Ideas from Previous Roadmap / Discussions

Collected from earlier conversations — not prioritized yet, preserved for future consideration.

### Audio Improvements
- **Word-by-word highlighting**: Sync audio position to highlight each word during playback. Requires word timing data from quran.com API (available for some reciters).
- **Multiple reciters**: Currently only Mishary Alafasy. Add Al-Hussary (slower, recommended for beginners), Abdul Basit, etc. everyayah.com has many reciters.
- **Audio scrubbing/seeking**: Proper seek bar for audio playback.

### Transliteration
- **Programmatic waqf transformation**: Automate verse-ending vowel changes for scaling beyond manually-scraped data (~90% of cases are systematic).
- **Simplified transliteration style**: Remove scholarly diacritics (ḥ→h, ṣ→s, ʿ→') for beginner-friendliness.

### UX Ideas (from Reddit research)
- **Recording & playback**: User records their recitation and plays it back to self-assess.
- **Arabic writing/tracing**: Digital whiteboard mode where user traces Arabic letters/words.
- **Similar passage tracker**: Flag verses that resemble each other across surahs to avoid confusion.
- **"Use in prayer" prompt**: After completing a surah, suggest "Recite this in your next prayer."
- **Multiple repetition patterns**: Offer alternatives to 6-4-4-6 — e.g. 10/10, 3x3, or 20x (Madinah method) as advanced settings.

### Data Source Consolidation (Tarteel QUL)
Tarteel's Quranic Universal Library (qul.tarteel.ai/resources) could replace current multi-source data pipeline:
- Quran metadata (juz/hizb/rub division points)
- Quran scripts (Uthmani, IndoPak Nastaleeq as JSON/SQLite)
- Recitations (multiple reciters with audio)
- Transliteration (structured JSON, replaces quran411 scraping)
- Mushaf layouts (for mushaf-style reference view)
- Currently pulling from 3 sources (quran.com API, everyayah.com, quran411 scraping). QUL consolidates into one open-source platform.

### Monetization (think about later)
- **Freemium**: First few surahs free, unlock full content for one-time £5-10.
- **Sadaqah model**: "If this helped you, support the project."
- **Premium features**: Advanced analytics, custom revision schedules, multiple reciters, voice recognition.
- Audience prefers one-time purchases over subscriptions for religious content.
