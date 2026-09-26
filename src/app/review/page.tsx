import { Suspense } from 'react';
import ReviewPage from './review-client';

export default function Page() {
  // Suspense: the client reads useSearchParams (?start=1), which static export requires to be bounded
  return (
    <Suspense>
      <ReviewPage />
    </Suspense>
  );
}
