'use client';

import { useState, useMemo } from 'react';
import type { Surah, Ayah, LessonDef } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import PracticeSession from './practice-session';
import Button from '@/components/ui/button';

interface JuzSection {
  surah: Surah;
  ayahStart: number;
  ayahEnd: number;
  lessons: LessonDef[];
}

interface JuzPracticeContainerProps {
  juzNum: number;
  sections: JuzSection[];
}

export default function JuzPracticeContainer({ juzNum, sections }: JuzPracticeContainerProps) {
  const [activeSession, setActiveSession] = useState<{ ayahs: Ayah[]; surahIds: number[] } | null>(null);

  const totalAyahs = useMemo(() => {
    let count = 0;
    for (const section of sections) {
      count += section.ayahEnd - section.ayahStart + 1;
    }
    return count;
  }, [sections]);

  const handlePracticeEntireJuz = () => {
    const allAyahs: Ayah[] = [];
    const surahIds: number[] = [];
    for (const section of sections) {
      const sectionAyahs = section.surah.ayahs.filter(
        (a) => a.number >= section.ayahStart && a.number <= section.ayahEnd
      );
      allAyahs.push(...sectionAyahs);
      if (!surahIds.includes(section.surah.id)) {
        surahIds.push(section.surah.id);
      }
    }
    if (allAyahs.length === 0) return;
    setActiveSession({ ayahs: allAyahs, surahIds });
  };

  if (activeSession) {
    return (
      <PracticeSession
        surahIds={activeSession.surahIds}
        title={`Juz ${juzNum}`}
        ayahs={activeSession.ayahs}
        lessonIds={[]}
        onDone={() => setActiveSession(null)}
      />
    );
  }

  return (
    <Button onClick={handlePracticeEntireJuz} className="w-full">
      Practice Entire Juz ({totalAyahs} ayahs)
    </Button>
  );
}
