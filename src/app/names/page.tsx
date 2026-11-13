import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Names of Allah · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the names99 package replaces this page.
export default function Page() {
  return <StubPage title="Names of Allah" back="/essentials" note="The Names of Allah, with their meanings. Coming soon." />;
}
