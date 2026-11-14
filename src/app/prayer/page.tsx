import type { Metadata } from 'next';
import PrayerHub from '@/components/prayer/times/hub';

export const metadata: Metadata = { title: 'Prayer · Takrar' };

// The Prayer tab (all-in-one spec 2.2): before setup one card; after it the Hijri
// line, the next prayer, the day's six times with the tracker slot, at most one
// contextual chip, and the tool tiles. All worked out on the device.
export default function Page() {
  return <PrayerHub />;
}
