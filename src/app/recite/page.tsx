import { Suspense } from 'react';
import ReciteClient from './recite-client';

// One static page serves every surah (/recite?s=<surah>) — see src/lib/routes.ts
export default function RecitePage() {
  return (
    <Suspense>
      <ReciteClient />
    </Suspense>
  );
}
