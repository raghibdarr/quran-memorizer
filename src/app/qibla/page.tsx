import type { Metadata } from 'next';
import QiblaClient from '@/components/qibla/qibla-client';

export const metadata: Metadata = { title: 'Qibla · Takrar' };

// The qibla (all-in-one spec 2.2): bearing from the saved place, a live compass
// where the phone has one, and a north-up diagram with a sun aid where it doesn't.
export default function Page() {
  return <QiblaClient />;
}
