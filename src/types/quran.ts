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

// Lesson & progress types

export type LessonPhase = 'listen' | 'understand' | 'chunk' | 'test' | 'complete';
export type TestLevel = 'fill-blank' | 'first-letter' | 'full-recall';

export interface LessonProgress {
  surahId: number;
  currentPhase: LessonPhase;
  phaseData: {
    listen: { playCount: number; completed: boolean };
    understand: { wordsReviewed: number; quizPassed: boolean; completed: boolean };
    chunk: { currentChunkIndex: number; completed: boolean };
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

// Chunk for progressive building

export interface Chunk {
  id: string;
  words: Word[];
  position: number;
}
