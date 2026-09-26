import { Suspense } from 'react';
import LessonLoader from './lesson-loader';

// One static page serves every lesson (/learn?s=<surah>&l=<lesson>) — see src/lib/routes.ts
export default function LearnPage() {
  return (
    <Suspense>
      <LessonLoader />
    </Suspense>
  );
}
