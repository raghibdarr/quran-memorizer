import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Match my mosque · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the match-mosque package replaces this page.
export default function Page() {
  return <StubPage title="Match my mosque" back="/prayer/settings" />;
}
