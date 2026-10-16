import { Suspense } from 'react';
import CirclesClient from './circles-client';

// One static page: the list (/circles) and a circle (/circles?c=<id>)
export default function CirclesPage() {
  return (
    <Suspense>
      <CirclesClient />
    </Suspense>
  );
}
