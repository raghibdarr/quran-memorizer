import type { Metadata } from 'next';
import TrackerClient from '@/components/worship/tracker-client';

export const metadata: Metadata = { title: 'Prayer log · Takrar' };

export default function Page() {
  return <TrackerClient />;
}
