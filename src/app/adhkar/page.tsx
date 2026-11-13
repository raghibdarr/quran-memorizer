import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Adhkar and duas · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the adhkar-duas package replaces this page.
export default function Page() {
  return <StubPage title="Adhkar and duas" back="/essentials" note="Morning and evening adhkar and everyday duas, with their sources. Coming soon." />;
}
