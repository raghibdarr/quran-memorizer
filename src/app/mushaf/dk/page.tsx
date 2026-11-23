import { Suspense } from 'react';
import MushafDkClient from './dk-client';

// Prototype: DigitalKhatt-justified Madina pages. One static page serves all
// 604 (/mushaf/dk?page=<1..604>), read on the client like /mushaf?p=.
export default function MushafDkPage() {
  return (
    <Suspense>
      <MushafDkClient />
    </Suspense>
  );
}
