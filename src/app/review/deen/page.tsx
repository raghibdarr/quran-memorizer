import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Hadith, duas and Names · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the deen-engine package replaces this page.
export default function Page() {
  return <StubPage title="Hadith, duas and Names" back="/review" note="Reviews for the hadith, duas and Names you learn. Coming soon." />;
}
