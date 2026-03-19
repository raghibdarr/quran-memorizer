'use client';

import { useState } from 'react';
import type { Surah, LessonDef, Ayah } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import PracticeSelection from './practice-selection';
import type { PracticeFlowMode } from './practice-selection';
import PracticeSession from './practice-session';

interface PracticeContainerProps {
  surah: Surah;
  lessons: LessonDef[];
  defaultAyahRange?: { start: number; end: number };
}

interface ActiveSession {
  ayahs: Ayah[];
  lessonIds: string[];
  flowMode: PracticeFlowMode;
}

export default function PracticeContainer({ surah, lessons, defaultAyahRange }: PracticeContainerProps) {
  const progressLessons = useProgressStore((s) => s.lessons);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

  const handleStart = (ayahRange: { start: number; end: number }, lessonIds: string[], flowMode: PracticeFlowMode) => {
    const sessionAyahs = surah.ayahs.filter(
      (a) => a.number >= ayahRange.start && a.number <= ayahRange.end
    );
    if (sessionAyahs.length === 0) return;
    setActiveSession({ ayahs: sessionAyahs, lessonIds, flowMode });
  };

  const handleDone = () => setActiveSession(null);

  if (activeSession) {
    return (
      <PracticeSession
        surahIds={[surah.id]}
        title={surah.nameSimple}
        ayahs={activeSession.ayahs}
        lessonIds={activeSession.lessonIds}
        initialStep={activeSession.flowMode === 'full-passage' ? 'full-passage' : 'ayah-by-ayah'}
        onDone={handleDone}
      />
    );
  }

  return (
    <PracticeSelection
      surah={surah}
      lessons={lessons}
      progressLessons={progressLessons}
      defaultAyahRange={defaultAyahRange}
      onStart={handleStart}
    />
  );
}
