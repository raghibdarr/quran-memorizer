import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Mosques · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the mosques package replaces this page.
export default function Page() {
  return <StubPage title="Mosques" back="/prayer" note="Mosques near you, from open map data. Coming soon." />;
}
