import { Suspense } from 'react';
import ListenClient from './listen-client';

// One static page serves every surah (/listen?s=<surah>) — see src/lib/routes.ts
export default function ListenPage() {
  return (
    <Suspense>
      <ListenClient />
    </Suspense>
  );
}
