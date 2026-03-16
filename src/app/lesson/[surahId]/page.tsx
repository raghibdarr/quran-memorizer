import { getSurah } from '@/lib/quran-data';
import { CURRICULUM_ORDER } from '@/lib/curriculum';
import LessonContainer from '@/components/lesson/lesson-container';
import { notFound } from 'next/navigation';

interface LessonPageProps {
  params: Promise<{ surahId: string }>;
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { surahId } = await params;
  const id = parseInt(surahId, 10);

  if (isNaN(id) || !(CURRICULUM_ORDER as readonly number[]).includes(id)) {
    notFound();
  }

  const surah = await getSurah(id);

  return <LessonContainer surah={surah} />;
}

export function generateStaticParams() {
  return CURRICULUM_ORDER.map((id) => ({ surahId: id.toString() }));
}
