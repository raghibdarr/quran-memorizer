import { Suspense } from 'react';
import type { Metadata } from 'next';
import AdhkarNowClient from '@/components/adhkar/now-client';

export const metadata: Metadata = { title: 'Adhkar · Takrar' };

// Suspense: the client reads ?set= with useSearchParams, which a static export needs bounded
export default function Page() {
  return (
    <Suspense>
      <AdhkarNowClient />
    </Suspense>
  );
}
