import { getSurah, getSurahLessons } from '@/lib/quran-data';
import { CURRICULUM_ORDER } from '@/lib/curriculum';
import LessonContainer from '@/components/lesson/lesson-container';
import { notFound } from 'next/navigation';

interface LessonPageProps {
  params: Promise<{ surahId: string; lessonNum: string }>;
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { surahId: surahIdStr, lessonNum: lessonNumStr } = await params;
  const surahId = parseInt(surahIdStr, 10);
  const lessonNum = parseInt(lessonNumStr, 10);

  if (isNaN(surahId) || isNaN(lessonNum)) notFound();

  let surah;
  try {
    surah = await getSurah(surahId);
  } catch {
    notFound();
  }

  const lessons = await getSurahLessons(surahId);
  const lessonDef = lessons.find((l) => l.lessonNumber === lessonNum);
  if (!lessonDef) notFound();

  // Slice ayahs for this lesson
  const ayahs = surah.ayahs.filter(
    (a) => a.number >= lessonDef.ayahStart && a.number <= lessonDef.ayahEnd
  );

  return (
    <LessonContainer
      surah={surah}
      ayahs={ayahs}
      lessonDef={lessonDef}
      totalLessons={lessons.length}
    />
  );
}
