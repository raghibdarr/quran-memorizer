import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import DeenReviewScreen from './deen-client';

export const metadata: Metadata = { title: 'Hadith, duas and Names · Takrar' };

/** The errata log, read at build time (the page is static): cards use it for "text corrected on <date>" */
function readErrata(): string {
  try {
    return readFileSync(join(process.cwd(), 'content', 'deen', 'ERRATA.md'), 'utf8');
  } catch {
    return '';
  }
}

export default function Page() {
  // Suspense: the client reads useSearchParams, which static export requires to be bounded
  return (
    <Suspense>
      <DeenReviewScreen errata={readErrata()} />
    </Suspense>
  );
}
