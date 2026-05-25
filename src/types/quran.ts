// Core Quran data types — sourced from API, cached as static JSON

export interface Word {
  position: number;
  textUthmani: string;
  transliteration: string | null;
  translation: string | null;
  audioUrl: string | null;
  charType: 'word' | 'end';
}

export interface Ayah {
  number: number;
  key: string;              // "114:1"
  textUthmani: string;
  textUthmaniTajweed?: string; // HTML with <tajweed> tags for color-coded rules
  textIndopak?: string;        // IndoPak/Nastaliq script
  words: Word[];
  translation: string;
  transliteration?: string;    // Ayah-level transliteration (waqf-style from quran411)
  audioUrl: string;            // everyayah.com URL
}

export type ArabicScriptStyle = 'tajweed' | 'uthmani' | 'indopak';

export interface Surah {
  id: number;
  nameSimple: string;       // "Al-Fatiha"
  nameArabic: string;       // "الفاتحة"
  nameTranslation: string;  // "The Opener"
  revelationPlace: 'makkah' | 'madinah';
  versesCount: number;
  ayahs: Ayah[];
}

export interface SurahMeta {
  id: number;
  nameSimple: string;
  nameArabic: string;
  nameTranslation: string;
  revelationPlace: 'makkah' | 'madinah';
  versesCount: number;
}

// Lesson structure

export interface LessonDef {
  lessonId: string;           // "78-3" = surah 78, lesson 3
  surahId: number;
  lessonNumber: number;       // 1-based
  ayahStart: number;          // first ayah number (inclusive)
  ayahEnd: number;            // last ayah number (inclusive)
  ayahCount: number;
  juzNumber: number;          // which juz this lesson belongs to
}

// Juz structure

export interface JuzSurahSegment {
  surahId: number;
  ayahStart: number;
  ayahEnd: number;
}

export interface JuzMeta {
  juzNumber: number;
  verseMappings: JuzSurahSegment[];
}

// Lesson & progress types

export type LessonPhase = 'listen' | 'understand' | 'chunk' | 'test' | 'complete';
export type TestLevel = 'fill-blank' | 'first-letter' | 'full-recall';

export interface LessonProgress {
  lessonId: string;           // e.g. "78-3"
  surahId: number;
  currentPhase: LessonPhase;
  phaseData: {
    listen: { playCount: number; completed: boolean };
    understand: { wordsReviewed: number; quizPassed: boolean; completed: boolean; exploredAyahs?: number[] };
    chunk: {
      currentChunkIndex: number;
      completed: boolean;
      stage?: 'learning' | 'chaining' | 'final-chain';
      learnStep?: 'listen-with-text' | 'recite-from-memory' | 'reinforce-with-text' | 'final-memory' | 'word-order';
      repCount?: number;
    };
    test: { currentLevel: TestLevel; attempts: number; completed: boolean };
  };
  startedAt: number;
  completedAt: number | null;
}

// Spaced repetition (SM-2)

export interface ReviewCard {
  surahId: number;
  ayahNumber: number;
  easeFactor: number;       // Default 2.5
  interval: number;         // Days until next review
  repetitions: number;
  nextReview: number;       // Timestamp
  lastReview: number;       // Timestamp
  lastQuality: number;      // 0-5
}

// Lesson-level spaced repetition

export interface LessonReviewCard {
  lessonId: string;          // e.g. "78-3"
  surahId: number;
  lessonNumber: number;
  ayahStart: number;
  ayahEnd: number;
  easeFactor: number;        // Default 2.5
  interval: number;          // Days until next review
  repetitions: number;
  nextReview: number;        // Timestamp
  lastReview: number;        // Timestamp
  lastQuality: number;       // 0-5
}

// User settings & stats

export interface UserSettings {
  reciter: string;
  arabicScript: ArabicScriptStyle;
  arabicFontSize: number;       // multiplier: 0.8, 1, 1.2, 1.4
  transliterationEnabled: boolean;
  translationEnabled: boolean;
  playbackSpeed: number;
  dailyGoalActivities: number;  // number of activities (lessons/reviews) per day
}

export interface UserStats {
  currentStreak: number;
  longestStreak: number;
  totalAyahsMemorized: number;
  lastActiveDate: string | null;  // ISO date string
  dailyActivities: number;        // activities completed today
  dailyActivityDate: string | null; // ISO date for dailyActivities
  activityLog: Record<string, number>; // ISO date → activity count (for heatmap)
}

// Practice mode types

export type PracticeAyahRating = 'got-it' | 'hesitated' | 'missed';
export type PracticeOverallRating = 'smooth' | 'some-mistakes' | 'need-practice';

export interface PracticeAyahResult {
  surahId: number;
  ayahNumber: number;
  rating: PracticeAyahRating;
  accuracy?: number;  // 0-1 from voice recognition
}

export interface PracticeSession {
  id: string;
  timestamp: number;
  surahIds: number[];
  lessonIds: string[];
  ayahRange: { start: number; end: number };
  ayahResults: PracticeAyahResult[];
  overallRating: PracticeOverallRating | null;
}

// Chunk for progressive building

export interface Chunk {
  id: string;
  words: Word[];
  position: number;
}

// Essentials — duas, dhikr, key ayahs

export interface EssentialItem {
  id: string;
  category: 'dua' | 'dhikr' | 'ayah';
  title: string;
  titleArabic?: string;
  description: string;
  arabic: string;
  transliteration: string;
  translation: string;
  audioUrl?: string;
  source?: string;
  repetitions?: number;
  surahId?: number;        // For Quranic ayahs — pull tajweed/indopak from surah data
  ayahNumber?: number;
}

export interface EssentialCollection {
  id: string;
  title: string;
  description: string;
  items: EssentialItem[];
}

// Hifdh curriculum planner

export type PlanGoalType = 'surah' | 'juz' | 'full-quran';

export interface HifdhPlan {
  id: string;
  createdAt: number;

  goalType: PlanGoalType;
  goalSurahIds: number[];        // Ordered list of surah ids in scope
  goalJuzNumbers: number[];      // Preserved so the dashboard can display the selection
  deadline: string | null;       // ISO date yyyy-mm-dd or null

  knownSurahIds: number[];       // Excluded from new lessons (still reviewed elsewhere)

  lessonsPerDay: number;         // 1-5
  studyDays: number[];           // 0=Sun ... 6=Sat

  completedLessonIds: string[];  // Plan-scoped completions (union with global progress on load)

  revisionFrequencyDays: number; // How often to revise completed surahs (default 7)
  revisionFrequencyAuto?: boolean; // When true, frequency adapts to completed surah count
  lastRevisedAt: Record<number, number>; // surahId -> timestamp

  // One-off "catch up" bump: extra lessons added to today's plan only.
  catchUpDate?: string | null;         // ISO yyyy-mm-dd the bonus applies to
  catchUpBonus?: number;               // Extra lessons on top of lessonsPerDay

  // Completion celebration
  finishCelebrated?: boolean;

  // Partial pre-assessment: specific lessons to skip
  knownLessonIds?: string[];
}

export interface SurahRevisionTask {
  surahId: number;
  surahName: string;
  lastRevised: number | null;
  daysSinceRevision: number;
  // Scope of revision within the plan (partial for juz-scoped plans)
  isPartial: boolean;
  ayahStart: number;
  ayahEnd: number;
  totalAyahsInSurah: number;
}

export interface TodaysPlan {
  date: string;                                  // ISO yyyy-mm-dd
  reviews: LessonReviewCard[];                   // SM-2 due lesson cards
  revisions: SurahRevisionTask[];                // Full-surah revisions due today
  newLessons: LessonDef[];                       // New lessons scheduled for today
  isRestDay: boolean;
  isComplete: boolean;                           // reviews + revisions + new lessons all done
  completedNewLessonIds: string[];               // Of today's new lessons, which are already done
}

export interface PlanProgress {
  totalLessons: number;
  completedLessons: number;
  percentage: number;                            // 0-100
  lessonsRemaining: number;
  projectedFinishDate: string | null;            // ISO date, null if no deadline & pace=0
  daysRemaining: number | null;                  // null if no deadline
  isOnTrack: boolean;
  lessonsBehind: number;                         // 0 if on track or no deadline
  currentPace: number;                           // lessons/day over the last 7 days
}
