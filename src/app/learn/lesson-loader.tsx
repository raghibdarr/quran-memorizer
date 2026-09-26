'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSurah, getSurahLessons } from '@/lib/quran-data';
import LessonContainer from '@/components/lesson/lesson-container';
import type { Ayah, LessonDef, Surah } from '@/types/quran';

// Lesson data loads on the CLIENT (M11a). Rendering it on the server embedded the
// entire surah in every lesson page's payload — ~2.4 MB for each of Al-Baqarah's
// lessons. The surah JSON is now one shared, cached code-split chunk, and one
// static page serves every lesson (see src/lib/routes.ts).

interface Loaded {
  surah: Surah;
  ayahs: Ayah[];
  lessonDef: LessonDef;
  totalLessons: number;
}

export default function LessonLoader() {
  const searchParams = useSearchParams();
  const surahId = parseInt(searchParams.get('s') ?? '', 10);
  const lessonNum = parseInt(searchParams.get('l') ?? '', 10);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(surahId) || !Number.isFinite(lessonNum)) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setLoaded(null);
    let cancelled = false;
    Promise.all([getSurah(surahId), getSurahLessons(surahId)])
      .then(([surah, lessons]) => {
        if (cancelled) return;
        const lessonDef = lessons.find((l) => l.lessonNumber === lessonNum);
        if (!lessonDef) {
          setMissing(true);
          return;
        }
        setLoaded({
          surah,
          ayahs: surah.ayahs.filter((a) => a.number >= lessonDef.ayahStart && a.number <= lessonDef.ayahEnd),
          lessonDef,
          totalLessons: lessons.length,
        });
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [surahId, lessonNum]);

  if (missing) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream px-6 text-center">
        <p className="text-sm text-muted">This lesson doesn&apos;t exist.</p>
      </div>
    );
  }
  if (!loaded) return <div className="min-h-dvh bg-cream" />;

  return (
    <LessonContainer
      surah={loaded.surah}
      ayahs={loaded.ayahs}
      lessonDef={loaded.lessonDef}
      totalLessons={loaded.totalLessons}
    />
  );
}
