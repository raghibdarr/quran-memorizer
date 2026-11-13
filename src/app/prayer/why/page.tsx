import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Why times differ · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the prayer-times package replaces this page.
export default function Page() {
  return <StubPage title="Why times differ" back="/prayer/settings" note="Why prayer times differ between apps and mosques. Coming soon." />;
}
