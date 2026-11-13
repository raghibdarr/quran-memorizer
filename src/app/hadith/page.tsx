import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Hadith · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the hadith-nawawi40 package replaces this page.
export default function Page() {
  return <StubPage title="Hadith" back="/essentials" />;
}
