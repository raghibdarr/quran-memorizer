import { Suspense } from 'react';
import type { Metadata } from 'next';
import LessonPlayer from '@/components/course/lesson-player';

export const metadata: Metadata = { title: 'Lesson · Takrar' };

// One micro-lesson, /course/lesson?l=<lessonId> (all-in-one spec 2.2).
export default function Page() {
  // Suspense: the client reads useSearchParams, which static export requires to be bounded
  return (
    <Suspense>
      <LessonPlayer />
    </Suspense>
  );
}
