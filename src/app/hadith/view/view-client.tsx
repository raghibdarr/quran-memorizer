'use client';

import { useSearchParams } from 'next/navigation';
import { HadithView } from '@/components/hadith/hadith-view';

export default function ViewClient() {
  const params = useSearchParams();
  const id = params.get('id');
  // Keyed by id: moving to the next hadith starts the screen fresh (scroll, open sheets)
  return <HadithView key={id ?? ''} rawId={id} />;
}
