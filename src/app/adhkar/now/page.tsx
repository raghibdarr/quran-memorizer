import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Adhkar · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the adhkar-duas package replaces this page.
export default function Page() {
  return <StubPage title="Adhkar" back="/prayer" note="The adhkar for this time of day, with a counter. Coming soon." />;
}
