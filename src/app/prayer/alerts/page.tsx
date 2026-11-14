import type { Metadata } from 'next';
import PrayerAlertsScreen from '@/components/prayer/alerts/alerts-screen';

export const metadata: Metadata = { title: 'Prayer alerts · Takrar' };

export default function Page() {
  return <PrayerAlertsScreen />;
}
