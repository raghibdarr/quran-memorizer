import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';

export const metadata: Metadata = { title: 'Prayer alerts · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the prayer-alerts package replaces this page.
export default function Page() {
  return <StubPage title="Prayer alerts" back="/prayer/settings" note="Choose which prayers alert you, and how. Coming soon." />;
}
