# Takrar Roadmap

Last updated: 2026-05-25

---

## Completed

### Foundations
- [x] Lesson splitting & Juz 30 expansion (37 surahs, ~5 ayah lessons)
- [x] Spaced repetition review UI (SM-2 card flow with per-ayah rating)
- [x] Review page redesign (due cards, surah-focused review, single-lesson review)
- [x] Supabase auth (Google OAuth, email/password, magic link)
- [x] Cloud sync (offline-first with per-store merge)
- [x] Logo redesign & theme-aware variants
- [x] Lesson-level review cards (SM-2 scheduling per lesson)

### P0 (formerly Ship-ASAP)
- [x] PWA / Offline support — service worker (`public/sw.js`), manifest (`src/app/manifest.ts`), install banner, offline fallback
- [x] Streak & Daily Goal fix — auditied, "X day streak" label, daily goal indicator on home

### P1
- [x] Onboarding flow — swipeable explainer cards (4 cards, dismissible)
- [x] Progress page revamp — calendar heatmap, timeline chart, ayah breakdown ring, stats grid
- [x] Chunk phase polish (commit `febffba`) — 6-4-4-6 pattern preserved as default; specific UX items (one-time tooltip, replay-beyond-minimum) not verified in code

### P2
- [x] Understand phase refinement — tap-to-reveal translation, no quiz gate
- [x] Hifdh Mode / Curriculum Planner — full feature, see notes below
- [x] Duas / Dhikr / Essentials section — basic version live (needs UX polish, see open work)

### P3
- [x] Calendar heatmap (local) — wired on progress page

---

## Hifdh Planner — shipped detail

Everything in `.claude/hifdh-curriculum-spec.md` plus polish layer:

- Goal types: single/multi surah, single/multi juz, full Quran (custom-range via From–To helper in surah picker)
- Optional deadline + auto-pace calculation with intensive/impossible thresholds
- Pre-assessment: surah-level + per-lesson partial pre-assessment
- Pacing: 1–5 grid + Custom input (max 20 lessons/day)
- Study days with rest-day-aware projection
- Today's Plan card on home: due reviews + revisions + new lessons + behind-schedule banner + catch-up action
- `/plan` dashboard: progress ring, pace/deadline/study-days/revision-freq editors, surah breakdown, delete
- `/plan/edit` — change scope mid-plan with feasibility warnings
- `/plan/revise/[surahId]` — scope-aware revision (only renders the ayahs in your plan scope)
- Revision frequency: presets (Intensive/Balanced/Light) + Auto mode that adapts to completed surah count
- Finish-early celebration modal
- Lesson-completion hook (plan auto-marks completions)
- Cloud sync (`quran-plan` in use-sync.ts with union-merge for completedLessonIds and lastRevisedAt)

---

## Open

### UI overhaul — tactile print (in progress, 2026-06-10)
Core implemented — see `.claude/plans/ui-overhaul-tactile-print.md` for the design language
(ink borders, offset shadows, press physics, beads, dark-mode contrast fix, safe-area).
Done: tokens/primitives, home, lesson phases (Build declutter), review, practice, bottom nav.
**Remaining:** screen passes for progress, plan pages, essentials, settings panel, auth modal,
onboarding (they inherit tokens but haven't had a deliberate pass); review-session card stack
not yet eyeballed with real due cards.

### Terminology cleanup (P1, partial)
Original goal: kill "practice" from UI, unify on **Learn** + **Review**. Status as of audit:
- Bottom nav and some surfaces done
- **Still exposing "Practice"**: juz page tab toggle (`/juz/[juzNum]`, "Learn / Practice"), home page "Continue Practicing" label, whole `src/components/practice/` directory + `practice-store.ts`
- Decide: kill the practice flow entirely (and migrate any unique value into Learn/Review), OR keep it but rename in UI ("Drill"? "Recite"?)

### Essentials polish (P2)
The section works but is basic. Concrete improvements:
- Search across all items
- Filter by category (dua / dhikr / ayah)
- Favorites / pin frequently used
- Sequential card-flow mode for adhkar (one-at-a-time swipe)
- Unify expand-reveal with the tap-to-reveal pattern from understand phase
- Audio "play all" for whole collection
- Better collection cards on index (progress bars, not just count)

### Social & Gamification (P3) — needs schema design first
Not a session item. Requires Supabase schema decisions before any frontend.

#### Activity feed + friends
- Chronological feed: "Raghi completed Al-Ikhlas L2", milestones ("finished memorizing Surah An-Naba")
- Privacy: opt-in (some users memorize privately)
- Needs Supabase tables: `friendships`, `activity_events`, RLS policies

#### Leaderboard + Groups (StepUp-style)
- Daily/weekly/monthly rankings
- Metrics: lessons completed, review streak, ayahs memorized
- Create/join multiple groups (halaqah, family, friends)
- Needs Supabase tables: `groups`, `group_members`, leaderboard views

### Unit Tests (P3)
- Targeted tests for pure functions: `processReview`, `processLessonReview`, `generateLessonsWithJuzBoundaries`, plan-lib helpers
- SM-2 math bugs are silent and only surface weeks later
- Skip UI component tests for now

---

## Future / Native App

- Voice recognition: whisper-large-v3 on-device (browser limited to whisper-base)
- Quran-specific pause/waqf detection: `obadx/recitation-segmenter-v2` (Wav2Vec2-BERT, 850h Quran data, 99.5% accuracy, MIT). Nice-to-have for a Tarteel-esque correctness UI as the segmentation layer alongside whisper ASR. Currently 0.6B params / ~3GB GPU — would need distillation/quantization for on-device, or run server-side. Evaluate after whisper-large-v3 is integrated.
- Push notifications for review reminders
- Widgets (daily ayah, streak)
- App Store / Play Store distribution
- React Native migration path: business logic (Zustand stores, SM-2, lesson progression, plan-lib) copies directly. Components need JSX rewrite (div→View). Audio → expo-av. Storage → expo-sqlite. Keep `/lib` with zero React deps for portability.

---

## Ideas / Backlog (unprioritized)

Collected from earlier conversations — preserved for future consideration.

### Audio
- **Word-by-word highlighting**: Sync audio position to highlight each word during playback. Requires word timing data from quran.com API (available for some reciters).
- **Multiple reciters**: Currently only Mishary Alafasy. Add Al-Hussary (slower, recommended for beginners), Abdul Basit, etc. everyayah.com has many reciters.
- **Audio scrubbing/seeking**: Proper seek bar for audio playback.

### Transliteration
- **Programmatic waqf transformation**: Automate verse-ending vowel changes for scaling beyond manually-scraped data (~90% of cases are systematic).
- **Simplified transliteration style**: Remove scholarly diacritics (ḥ→h, ṣ→s, ʿ→') for beginner-friendliness.

### UX (from Reddit research)
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

### Planner enhancements (future)
- Multiple concurrent plans
- Collaborative plans (study group with shared progress)
- AI-optimised ordering (based on surah difficulty, user performance)
- Calendar export (add study sessions to Google Calendar)
- Streak freeze (like Duolingo — use a "freeze" to keep streak on a missed day)

### Monetization (think about later)
- **Freemium**: First few surahs free, unlock full content for one-time £5-10.
- **Sadaqah model**: "If this helped you, support the project."
- **Premium features**: Advanced analytics, custom revision schedules, multiple reciters, voice recognition.
- Audience prefers one-time purchases over subscriptions for religious content.
