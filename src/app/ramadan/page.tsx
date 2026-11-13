import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Ramadan · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the hijri-ramadan package replaces this page.
export default function Page() {
  return <StubPage title="Ramadan" back="/prayer" note="Suhoor and iftar times, and a log of your fasts. Coming soon." />;
}
