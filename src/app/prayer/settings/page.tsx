import type { Metadata } from 'next';
import PrayerSettingsScreen from '@/components/prayer/times/settings-screen';

export const metadata: Metadata = { title: 'Prayer settings · Takrar' };

// Place, method, Asr, high-latitude rule, offsets, Hijri offset, Home strip (spec 2.2)
export default function Page() {
  return <PrayerSettingsScreen />;
}
