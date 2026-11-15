import type { Metadata } from 'next';
import CourseHome from '@/components/course/course-home';

export const metadata: Metadata = { title: 'Foundations course · Takrar' };

// Foundations course (all-in-one spec 2.2): the units the registry has ready,
// with a continue card and per-lesson done marks. Lessons load on this screen
// only (dynamic import through the deck registry).
export default function Page() {
  return <CourseHome />;
}
