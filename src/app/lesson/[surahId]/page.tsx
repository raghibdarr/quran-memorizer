import { Suspense } from 'react';
import { surahIdParams } from '@/lib/static-params';
import SurahDetailPage from './surah-client';

export const dynamicParams = false;
export const generateStaticParams = surahIdParams;

export default function Page() {
  // Suspense: the client reads useSearchParams, which static export requires to be bounded
  return (
    <Suspense>
      <SurahDetailPage />
    </Suspense>
  );
}
