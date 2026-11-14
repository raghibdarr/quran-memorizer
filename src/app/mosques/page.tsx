import type { Metadata } from 'next';
import MosqueFinder from '@/components/mosques/mosque-finder';

export const metadata: Metadata = { title: 'Mosques · Takrar' };

// Mosques near the user's place, from OpenStreetMap country packs (all-in-one spec 2.2, 4)
export default function Page() {
  return <MosqueFinder />;
}
