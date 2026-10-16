import { Suspense } from 'react';
import MushafClient from './mushaf-client';

// One static page serves every mushaf page (/mushaf?p=<1..604>)
export default function MushafPage() {
  return (
    <Suspense>
      <MushafClient />
    </Suspense>
  );
}
