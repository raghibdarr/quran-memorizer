import { Suspense } from 'react';
import type { Metadata } from 'next';
import AdhkarDeckClient from '@/components/adhkar/deck-client';

export const metadata: Metadata = { title: 'Adhkar and duas · Takrar' };

// Suspense: the client reads ?d= with useSearchParams, which a static export needs bounded
export default function Page() {
  return (
    <Suspense>
      <AdhkarDeckClient />
    </Suspense>
  );
}
