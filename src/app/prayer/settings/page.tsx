import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Prayer settings · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the prayer-times package replaces this page.
export default function Page() {
  return <StubPage title="Prayer settings" back="/prayer" note="Your place, calculation method and Asr time. Coming soon." />;
}
