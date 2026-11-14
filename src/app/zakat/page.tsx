import type { Metadata } from 'next';
import ZakatCalculator from '@/components/zakat/zakat-calculator';

export const metadata: Metadata = { title: 'Zakat · Takrar' };

// Zakat calculator (all-in-one spec 2.2, 6): nisab on both bases, positions where
// the schools differ, the zakat year in lunar months. Device-only; no network.
export default function Page() {
  return <ZakatCalculator />;
}
