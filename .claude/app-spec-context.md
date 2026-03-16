# Quran Hifz App — Technical Spec & Build Guide

## Product summary

A beginner-focused Quran memorization app targeting Juz Amma. The core differentiator is a guided, multi-phase learning flow that takes users from zero to memorized — not just a verification tool. Built on research-backed techniques: listen-first learning, chunking, semantic understanding, and spaced repetition.

Working title ideas: **HifzFlow**, **AyahByAyah**, **JuzAmma.app** (pick something, don't bikeshed)

---

## Tech stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 14+ (App Router) | SSR for SEO, easy Vercel deploy, React for future RN port |
| Styling | Tailwind CSS | Fast iteration, mobile-first utilities |
| State | Zustand | Lightweight, simple, ports well to RN |
| Storage (V1) | localStorage + IndexedDB | No backend needed for MVP. Use `idb-keyval` for IndexedDB |
| Storage (V2) | Supabase | When you need auth + sync (you already know Supabase from QuranTracker) |
| Audio | HTML5 Audio API | Native, no deps needed |
| Quran data | quran.com API + static JSON | Word-by-word data, translations, transliterations |
| Audio source | everyayah.com / quran.com CDN | Free, high-quality recitation audio |
| Deployment | Vercel | Zero config for Next.js |

### Why not a backend for V1?
You don't need auth or sync to validate this. Store everything locally. If users want cross-device sync later, bolt on Supabase (you already know how). Ship faster.

### Future: React Native migration path
- Business logic (Zustand stores, spaced repetition, lesson progression) → copy directly
- Components → rewrite JSX (div→View, p→Text) but structure stays
- Audio → use expo-av
- Storage → use expo-sqlite or async-storage
- Shared: create a `/lib` or `/core` folder with zero React dependencies for all pure logic

---

## Data model

### Static content (sourced from API, cached as JSON)

```typescript
// Core Quran data — fetched once, stored as static JSON
interface Surah {
  id: number;                    // e.g. 114
  nameArabic: string;            // "النَّاس"
  nameTransliteration: string;   // "An-Nas"
  nameEnglish: string;           // "Mankind"
  totalAyahs: number;
  revelationType: 'meccan' | 'medinan';
}

interface Ayah {
  id: string;                    // "114:1"
  surahId: number;
  ayahNumber: number;
  textArabic: string;
  textTransliteration: string;
  translation: string;           // English (Sahih International or Clear Quran)
  audioUrl: string;              // Full ayah audio
  words: Word[];
}

interface Word {
  id: string;                    // "114:1:1"
  position: number;              // 1-indexed within ayah
  arabic: string;                // "قُلْ"
  transliteration: string;       // "Qul"
  translation: string;           // "Say"
  audioUrl: string;              // Individual word audio
}
```

### Curriculum structure

```typescript
interface Lesson {
  id: string;                    // "lesson-an-nas-1"
  surahId: number;
  title: string;                 // "An-Nas: Verses 1-3"
  ayahRange: [number, number];   // [1, 3]
  order: number;                 // Global order in curriculum
  estimatedMinutes: number;      // 10-15 for short surahs
  chunks: Chunk[];               // Pre-computed chunks for this lesson
}

interface Chunk {
  id: string;                    // "chunk-114-1-a"
  words: Word[];                 // 2-4 words
  position: number;              // Order within lesson
  audioUrl: string;              // Audio for just this chunk
}
```

### User state (stored locally)

```typescript
interface UserProgress {
  lessonId: string;
  currentPhase: Phase;
  phaseData: {
    listen: { timesPlayed: number; completed: boolean };
    understand: { wordsReviewed: number; completed: boolean };
    chunk: { currentChunkIndex: number; completed: boolean };
    test: { currentLevel: TestLevel; attempts: number; completed: boolean };
  };
  startedAt: number;             // timestamp
  completedAt: number | null;
}

type Phase = 'listen' | 'understand' | 'chunk' | 'test' | 'complete';
type TestLevel = 'fill-blank' | 'first-letter' | 'full-recall';

interface ReviewCard {
  ayahId: string;                // "114:1"
  easeFactor: number;            // Default 2.5
  interval: number;              // Days until next review
  repetitions: number;           // Times successfully recalled
  nextReview: number;            // Timestamp
  lastReview: number;            // Timestamp
  lastQuality: number;           // 0-5 rating
}

interface UserSettings {
  preferredReciter: string;      // Default: "Mishary Rashid Alafasy"
  showTransliteration: boolean;  // Default: true
  dailyGoalMinutes: number;      // Default: 10
  notificationsEnabled: boolean;
}

interface UserStats {
  currentStreak: number;         // Days
  longestStreak: number;
  totalAyahsMemorized: number;
  totalMinutesLearned: number;
  lastActiveDate: string;        // "2026-03-16"
}
```

---

## Curriculum order (MVP scope)

Start with the most commonly memorized surahs, ordered by familiarity and length.
**MVP: Just the first 5-8. Ship this.**

| Order | Surah | Ayahs | Why this order |
|-------|-------|-------|----------------|
| 1 | Al-Fatiha (1) | 7 | Everyone needs this for salah |
| 2 | Al-Ikhlas (112) | 4 | Very short, commonly recited |
| 3 | Al-Falaq (113) | 5 | Short, pairs with An-Nas |
| 4 | An-Nas (114) | 6 | Short, pairs with Al-Falaq |
| 5 | Al-Kawthar (108) | 3 | Shortest surah in Quran |
| 6 | Al-Asr (103) | 3 | Very short, powerful meaning |
| 7 | An-Nasr (110) | 3 | Short |
| 8 | Al-Masad (111) | 5 | Short |
| 9+ | Continue through Juz Amma... | | Add post-launch |

Each surah gets split into lessons of ~3 ayahs (or the full surah if ≤4 ayahs).

---

## Core learning flow — phase by phase

### Phase 1: Listen & absorb
**Goal:** Familiarize with the sound, rhythm, and flow before any active work.

**UX:**
- Full-screen focus mode. Arabic text centered, large font.
- Below: transliteration (toggleable) and translation
- Audio auto-plays the full passage from a reciter
- Progress indicator: "Listen 1 of 5"
- User must listen at least 3 times before "Continue" enables
- Optional: slow-speed toggle (0.75x) for complex ayahs
- Subtle highlight follows along word-by-word as audio plays

**Why 3 listens minimum:** Research shows auditory learners absorb rhythm and pronunciation patterns through repetition before active memorization. This phase is about passive intake — don't rush it.

**Component:** `<ListenPhase />`
```
Props: lesson: Lesson, onComplete: () => void
State: playCount, isPlaying, playbackSpeed
Logic: Enable "Continue" when playCount >= 3
```

### Phase 2: Understand
**Goal:** Connect meaning to each word so memorization has semantic anchors.

**UX:**
- Word-by-word breakdown displayed horizontally (Arabic R-to-L)
- Each word is a tappable card showing:
  - Arabic (large)
  - Transliteration (medium)
  - English meaning (small)
- Tap a word → plays its individual audio
- After reviewing all words, show a simple matching quiz:
  - Given an English meaning, pick the Arabic word (multiple choice)
  - 3-4 questions, not exhaustive — just enough to engage
- "Continue" enables after all words reviewed + quiz passed

**Why this phase exists:** Studies show semantic memory (understanding meaning) produces significantly better retention than pure rote memorization. Even basic meaning creates cognitive hooks.

**Component:** `<UnderstandPhase />`
```
Props: lesson: Lesson, onComplete: () => void
State: reviewedWords: Set<string>, quizState
Subcomponents: <WordCard />, <MeaningQuiz />
```

### Phase 3: Chunk & build
**Goal:** Break the passage into small pieces and assemble progressively.

**UX:**
- Display the full ayah at top (dimmed) as reference
- Active chunk highlighted below
- Flow:
  1. Show Chunk A (2-4 words). Play audio. User sees Arabic + transliteration.
  2. User taps "I've got it" or audio repeats
  3. Hide the text. Play audio. User mentally recites along.
  4. Reveal text to confirm.
  5. Move to Chunk B. Same process.
  6. Now combine: show A+B together. Play combined audio.
  7. Hide, listen, confirm.
  8. Add Chunk C. Repeat.
  9. Continue until full ayah is built up.
- Visual: chunks light up in sequence like building blocks
- Each "Hide → Listen → Reveal" cycle is one tap

**The key insight:** This is the phase that existing apps skip entirely. They go straight from "here's the text" to "now recite from memory." The chunking method bridges that gap by giving structure to the initial learning.

**Component:** `<ChunkPhase />`
```
Props: lesson: Lesson, onComplete: () => void
State: currentChunkIndex, builtChunks: Chunk[], stage: 'show'|'hide'|'reveal'
Logic: Progressive accumulation — each new chunk gets added to the chain
```

**Chunk generation algorithm:**
```typescript
function generateChunks(ayah: Ayah): Chunk[] {
  const words = ayah.words;
  const chunks: Chunk[] = [];
  let i = 0;
  
  while (i < words.length) {
    // Target 2-4 words per chunk
    // Prefer breaking at natural phrase boundaries
    // For MVP: just split into groups of 2-3
    const chunkSize = words.length - i <= 4 ? words.length - i : 
                      words.length - i <= 6 ? Math.ceil((words.length - i) / 2) : 3;
    chunks.push({
      id: `chunk-${ayah.id}-${chunks.length}`,
      words: words.slice(i, i + chunkSize),
      position: chunks.length,
      audioUrl: '' // Generate by combining word audios or extract from ayah audio
    });
    i += chunkSize;
  }
  return chunks;
}
```

### Phase 4: Test & recall
**Goal:** Active recall at increasing difficulty to cement the memory.

**UX — Three progressive levels:**

**Level 1: Fill in the blank**
- Show the full ayah in Arabic with 1-2 words replaced by blanks (______)
- Multiple choice options below (4 choices)
- If wrong, highlight correct answer, replay audio for that word
- 3 rounds with different blanked words

**Level 2: First letter hints**
- Show only the first Arabic letter of each word: "ق_ أ_ ب_ ا_ م_ ا_"
- User tries to recite the full ayah (self-assessment)
- Tap to reveal full text
- Rate yourself: "Got it" / "Almost" / "Need more practice"

**Level 3: Full recall**
- Blank screen with just the surah name and ayah number
- "Recite from memory, then tap to check"
- Full text reveals on tap
- Self-rate: 1-5 quality scale (feeds into spaced repetition)

**If user rates poorly on any level:** Loop back to the chunk phase for that ayah.
**If user passes all three levels:** Lesson complete → enters spaced repetition.

**Component:** `<TestPhase />`
```
Props: lesson: Lesson, onComplete: (quality: number) => void
State: currentLevel: TestLevel, currentRound, results[]
Subcomponents: <FillBlank />, <FirstLetterHints />, <FullRecall />
```

### Phase 5: Lesson complete
**UX:**
- Celebration screen (keep it tasteful — no confetti cannons)
- Stats: time taken, accuracy
- "This ayah will be reviewed tomorrow" message
- CTA: "Continue to next lesson" or "Done for today"

---

## Spaced repetition algorithm (SM-2 simplified)

```typescript
const MIN_EASE_FACTOR = 1.3;
const DAY_MS = 86400000;

interface ReviewResult {
  card: ReviewCard;
  nextReviewDate: Date;
}

function processReview(card: ReviewCard, quality: number): ReviewResult {
  // quality: 0-5
  // 0 = complete blackout
  // 1 = incorrect, but recognized after seeing answer  
  // 2 = incorrect, but answer felt familiar
  // 3 = correct with serious difficulty
  // 4 = correct with some hesitation
  // 5 = perfect, instant recall
  
  const updated = { ...card };
  
  if (quality < 3) {
    // Failed — reset to beginning
    updated.repetitions = 0;
    updated.interval = 1; // Review tomorrow
  } else {
    // Passed — increase interval
    if (updated.repetitions === 0) {
      updated.interval = 1;      // 1 day
    } else if (updated.repetitions === 1) {
      updated.interval = 3;      // 3 days
    } else if (updated.repetitions === 2) {
      updated.interval = 7;      // 1 week
    } else {
      updated.interval = Math.round(updated.interval * updated.easeFactor);
    }
    updated.repetitions += 1;
  }
  
  // Update ease factor
  updated.easeFactor = Math.max(
    MIN_EASE_FACTOR,
    updated.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );
  
  updated.lastReview = Date.now();
  updated.lastQuality = quality;
  updated.nextReview = Date.now() + updated.interval * DAY_MS;
  
  return { card: updated, nextReviewDate: new Date(updated.nextReview) };
}

function createNewCard(ayahId: string): ReviewCard {
  return {
    ayahId,
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: Date.now(), // Review immediately available
    lastReview: 0,
    lastQuality: 0,
  };
}

function getDueReviews(cards: ReviewCard[]): ReviewCard[] {
  const now = Date.now();
  return cards
    .filter(c => c.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview);
}
```

### Review session UX
- Home screen shows: "X ayahs due for review"
- Review session: for each due card, show the ayah number + surah name
- User recites from memory, taps to reveal
- Self-rates 0-5 (simplify to 3 buttons: "Forgot" = 1, "Hard" = 3, "Easy" = 5)
- If "Forgot": card resets, will appear again at end of session
- Session ends when all due cards are processed

---

## Component tree

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout, fonts, metadata
│   ├── page.tsx                  # Home / dashboard
│   ├── learn/
│   │   └── [lessonId]/
│   │       └── page.tsx          # Lesson flow
│   ├── review/
│   │   └── page.tsx              # Spaced repetition review session
│   └── progress/
│       └── page.tsx              # Stats & surah progress
│
├── components/
│   ├── layout/
│   │   ├── BottomNav.tsx         # Home | Learn | Review | Progress
│   │   └── TopBar.tsx            # Streak counter, settings gear
│   │
│   ├── home/
│   │   ├── ReviewDueCard.tsx     # "5 ayahs due for review"
│   │   ├── ContinueLessonCard.tsx # "Continue An-Nas: Verse 2"
│   │   └── SurahGrid.tsx        # Grid of surahs with progress rings
│   │
│   ├── lesson/
│   │   ├── LessonShell.tsx       # Manages phase transitions
│   │   ├── ListenPhase.tsx
│   │   ├── UnderstandPhase.tsx
│   │   ├── ChunkPhase.tsx
│   │   ├── TestPhase.tsx
│   │   ├── LessonComplete.tsx
│   │   └── shared/
│   │       ├── AyahDisplay.tsx   # Arabic + transliteration + translation
│   │       ├── WordCard.tsx      # Tappable word with audio
│   │       ├── AudioPlayer.tsx   # Play/pause/speed controls
│   │       └── ProgressBar.tsx   # Phase progress indicator
│   │
│   ├── review/
│   │   ├── ReviewSession.tsx     # Manages review card queue
│   │   └── ReviewCard.tsx        # Single card: recall + reveal + rate
│   │
│   └── progress/
│       ├── SurahProgressList.tsx
│       ├── StreakCalendar.tsx
│       └── StatsOverview.tsx
│
├── lib/
│   ├── quran-data.ts             # Fetch/cache surah + ayah + word data
│   ├── audio.ts                  # Audio playback utilities
│   ├── spaced-repetition.ts      # SM-2 algorithm (the code above)
│   ├── chunks.ts                 # Chunk generation logic
│   ├── curriculum.ts             # Lesson ordering and structure
│   └── storage.ts                # localStorage/IndexedDB wrapper
│
├── stores/
│   ├── progress-store.ts         # Zustand: lesson progress, completion
│   ├── review-store.ts           # Zustand: review cards, due items
│   └── settings-store.ts         # Zustand: user preferences
│
└── data/
    ├── surahs.json               # Static surah metadata
    └── curriculum.json            # Lesson structure + ordering
```

---

## Data sourcing

### Quran.com API (v4)
- Endpoint: `https://api.quran.com/api/v4/`
- Word-by-word: `GET /verses/by_chapter/{chapter}?words=true&translations=131&word_fields=text_uthmani,text_indopak`
- Audio: `GET /recitations/{reciter_id}/by_chapter/{chapter}`
- Transliteration: included in word fields
- **Rate limits:** Be respectful. Fetch once, cache as static JSON in your `/data` folder.
- **Alternative:** Download their open-source data dumps from GitHub (quran/quran.com-api)

### Audio sources
- **everyayah.com:** `https://everyayah.com/data/{reciter_folder}/{surah}{ayah}.mp3`
  - Mishary Rashid: `Alafasy_128kbps`
  - Format: 3-digit surah + 3-digit ayah, e.g. `114001.mp3`
- **Word-level audio:** Quran.com API provides word-by-word audio URLs
- For chunk audio: either concatenate word audios client-side or just play the full ayah and let users mentally segment

### Pre-processing recommendation
Rather than hitting APIs at runtime, fetch all data for your MVP surahs and save as static JSON:

```typescript
// scripts/fetch-quran-data.ts
// Run once, outputs to /data/surah-114.json etc.
// Include: ayahs, words, transliterations, translations, audio URLs
```

This makes the app fast and offline-capable from day one.

---

## Key UX decisions

### 1. No account required
Don't gate anything behind sign-up for V1. Store progress locally. Add optional Supabase auth later for sync.

### 2. Transliteration toggle
Default ON for complete beginners. Let users turn it off as they get comfortable with Arabic script. This is crucial — many of your target users can't read Arabic at all.

### 3. Self-assessment over AI voice recognition
Tarteel's moat is voice recognition. Don't compete on that. Self-assessment ("Did you get it right?") is simpler, works offline, and is honest — the user knows whether they got it right. Add voice features in V2 if there's demand.

### 4. Mobile-first layout
Even though it's a web app, design for mobile viewport first (375px). Most of your users will access this on their phone. The lesson flow should feel like swiping through cards, not scrolling a webpage.

### 5. RTL support
Arabic text must render right-to-left. Use `dir="rtl"` on Arabic text containers. Transliteration and English stay LTR. Test this early — RTL layout bugs are painful to fix later.

### 6. Offline support
Use a service worker (Next.js PWA plugin) to cache:
- All static JSON data
- Audio files for downloaded surahs
- The app shell

Users should be able to do lessons and reviews without internet.

---

## Design direction

Given your audience (Muslims wanting to connect with the Quran), the design should feel:
- **Calm and focused** — not gamified/flashy. This is worship, not Duolingo.
- **Clean with warm tones** — think cream/warm white backgrounds, deep teal or navy accents, gold/amber for highlights
- **Arabic typography as a first-class citizen** — use a proper Arabic font like Amiri, KFGQPC Uthmanic Script, or Scheherazade New for Quranic text. Don't rely on system Arabic fonts.
- **Generous whitespace** — let the Arabic text breathe
- **Subtle progress indicators** — circular progress rings per surah, a simple streak counter

Fonts to consider:
- Arabic/Quran text: `Scheherazade New` or `Amiri` (Google Fonts, free)
- UI text: `Plus Jakarta Sans` or `DM Sans` (clean, modern, pairs well)

Color palette suggestion:
- Background: `#FEFCF9` (warm cream)
- Primary: `#1B4D5C` (deep teal)
- Accent: `#C8963E` (muted gold)
- Success: `#2D7A4F` (forest green)
- Text: `#2C2C2A` (near-black)
- Muted: `#8A8A85` (warm gray)

---

## What to build first (implementation order)

### Week 1: Foundation
- [ ] Next.js project setup with Tailwind
- [ ] Fetch and cache Quran data for Al-Fatiha + Al-Ikhlas (2 surahs)
- [ ] Build `AyahDisplay` component (Arabic + transliteration + translation)
- [ ] Build `AudioPlayer` component (play/pause, speed control)
- [ ] Basic routing: home page with surah list

### Week 2: Core lesson flow
- [ ] `ListenPhase` — audio playback with play counter
- [ ] `UnderstandPhase` — word-by-word breakdown + simple quiz
- [ ] `ChunkPhase` — the progressive build-up flow
- [ ] `TestPhase` — fill-blank + first-letter + full recall
- [ ] `LessonShell` — phase transitions and progress saving
- [ ] localStorage persistence for lesson progress

### Week 3: Review + polish
- [ ] Spaced repetition engine (SM-2)
- [ ] Review session page
- [ ] Home page: due reviews count, continue lesson card
- [ ] Progress page: surah progress rings, basic stats
- [ ] Streak tracking
- [ ] Mobile layout polish + RTL testing

### Week 4: Ship it
- [ ] Add 3-4 more surahs (An-Nas, Al-Falaq, Al-Kawthar, Al-Asr)
- [ ] Service worker for offline support
- [ ] Deploy to Vercel
- [ ] Basic SEO: meta tags, Open Graph
- [ ] Share it in 2-3 communities and see what happens

---

## Monetization notes (think about later, not now)

Don't add any monetization for V1. Ship it free. Options for later:
- **Freemium:** First 3 surahs free, unlock full Juz Amma for £5-10 one-time
- **Tip jar / Sadaqah:** "If this helped you, support the project"
- **Premium features:** Advanced analytics, custom revision schedules, multiple reciters

The audience is more receptive to one-time purchases than subscriptions for religious content.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Scope creep | MVP = 5 surahs, 4 learning phases, basic review. That's it. |
| Arabic rendering bugs | Test RTL early. Use a dedicated Quran font, not system fonts. |
| Audio loading/buffering | Pre-cache audio. Show loading state. Degrade gracefully offline. |
| Content accuracy | Have a knowledgeable Muslim review translations and transliterations before launch. Don't guess. |
| Tarteel adds beginner flow | Your focus and speed are your advantage. Ship fast, iterate based on feedback. |
| Low retention / drop-off | Spaced repetition notifications. Keep sessions short (10 min). Streak mechanics. |

---

## Resources & links

- Quran.com API docs: https://api-docs.quran.com/
- Quran.com GitHub (open data): https://github.com/quran/quran.com-api
- everyayah.com audio: https://everyayah.com/
- Al Quran Cloud API: https://alquran.cloud/api
- SM-2 algorithm reference: https://super-memory.com/english/ol/sm2.htm
- Scheherazade New font: https://fonts.google.com/specimen/Scheherazade+New
- Amiri font: https://fonts.google.com/specimen/Amiri