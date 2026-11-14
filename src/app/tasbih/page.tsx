import { Suspense } from 'react';
import type { Metadata } from 'next';
import TasbihClient from '@/components/worship/tasbih-client';

export const metadata: Metadata = { title: 'Tasbih · Takrar' };

// Suspense: the client reads ?d= with useSearchParams, which a static export
// needs bounded
export default function Page() {
  return (
    <Suspense>
      <TasbihClient />
    </Suspense>
  );
}
