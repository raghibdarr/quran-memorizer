import type { Metadata } from 'next';
import StubPage from '@/components/ui/stub-page';
import PrayerToolTiles from '@/components/prayer/tool-tiles';

export const metadata: Metadata = { title: 'Prayer · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the prayer-times package replaces this
// page with the real hub, rendering the four slots in src/components/prayer/slots
// and the tools with <PrayerToolTiles />.
export default function Page() {
  return (
    <StubPage
      title="Prayer"
      root
      subtitle="Times, qibla and worship tools"
      note="Prayer times are coming soon. They'll be worked out on your device, so your location stays with you."
    >
      <PrayerToolTiles />
    </StubPage>
  );
}
