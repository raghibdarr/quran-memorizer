import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Tasbih · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the worship-tracking package replaces this page.
export default function Page() {
  return <StubPage title="Tasbih" back="/prayer" note="A counter for dhikr. Coming soon." />;
}
