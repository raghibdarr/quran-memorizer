import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Foundations course · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the course-ui package replaces this page.
export default function Page() {
  return <StubPage title="Foundations course" back="/essentials" />;
}
