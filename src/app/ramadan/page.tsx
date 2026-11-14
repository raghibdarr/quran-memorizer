import type { Metadata } from 'next';
import RamadanClient from '@/components/ramadan/ramadan-client';

export const metadata: Metadata = { title: 'Ramadan · Takrar' };

export default function Page() {
  return <RamadanClient />;
}
