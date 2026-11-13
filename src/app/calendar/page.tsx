import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Hijri calendar · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the hijri-ramadan package replaces this page.
export default function Page() {
  return <StubPage title="Hijri calendar" back="/prayer" note="The Islamic months, with expected dates for the year ahead. Coming soon." />;
}
