import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Sources and method · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the deen-engine package replaces this page.
export default function Page() {
  return <StubPage title="Sources and method" back="/essentials" note="Where each text in Takrar comes from, and how it was checked. Coming soon." />;
}
