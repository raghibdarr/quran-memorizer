import type { Metadata } from 'next';
import PrayerSetupFlow from '@/components/prayer/times/setup-flow';

export const metadata: Metadata = { title: 'Set up prayer times · Takrar' };

// Prayer setup (all-in-one spec 2.7): place, method and Asr, then alerts
export default function Page() {
  return <PrayerSetupFlow />;
}
