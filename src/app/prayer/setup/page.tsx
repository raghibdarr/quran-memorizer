import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Set up prayer times · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the prayer-times package replaces this page.
export default function Page() {
  return <StubPage title="Set up prayer times" back="/prayer" note="Choose your place and how times are worked out. Coming soon." />;
}
