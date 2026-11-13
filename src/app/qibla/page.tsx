import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Qibla · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the qibla package replaces this page.
export default function Page() {
  return <StubPage title="Qibla" back="/prayer" note="The direction of the Kaaba from where you are. Coming soon." />;
}
