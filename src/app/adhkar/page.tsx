import type { Metadata } from 'next';
import AdhkarIndexClient from '@/components/adhkar/index-client';

export const metadata: Metadata = { title: 'Adhkar and duas · Takrar' };

export default function Page() {
  return <AdhkarIndexClient />;
}
