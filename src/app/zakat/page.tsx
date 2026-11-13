import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Zakat · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the zakat package replaces this page.
export default function Page() {
  return <StubPage title="Zakat" back="/prayer" note="Work out how much zakat is due. Coming soon." />;
}
