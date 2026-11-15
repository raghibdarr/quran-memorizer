import type { Metadata } from 'next';
import NamesScreen from '@/components/names/names-screen';

export const metadata: Metadata = { title: 'Names of Allah · Takrar' };

// The ninety-nine Names (all-in-one spec 2.2; names99 package)
export default function Page() {
  return <NamesScreen />;
}
