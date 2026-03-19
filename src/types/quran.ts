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

// User settings & stats

export interface UserSettings {
  reciter: string;
  arabicScript: ArabicScriptStyle;
  arabicFontSize: number;       // multiplier: 0.8, 1, 1.2, 1.4
  transliterationEnabled: boolean;
  translationEnabled: boolean;
  playbackSpeed: number;
  dailyGoalMinutes: number;
}

export interface UserStats {
  currentStreak: number;
  longestStreak: number;
  totalAyahsMemorized: number;
  totalMinutesLearned: number;
  lastActiveDate: string | null;  // ISO date string
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
