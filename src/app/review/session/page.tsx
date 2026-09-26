import { Suspense } from 'react';
import ReviewSessionScreen from './session-client';

export default function Page() {
  // Suspense: the client reads useSearchParams, which static export requires to be bounded
  return (
    <Suspense>
      <ReviewSessionScreen />
    </Suspense>
  );
}
