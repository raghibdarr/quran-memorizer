import type { Metadata } from 'next';
import WhyTimesDiffer from '@/components/prayer/times/why-content';

export const metadata: Metadata = { title: 'Why times differ · Takrar' };

// A plain explainer of why prayer times differ (spec 2.2). Shows the positions; picks none.
export default function Page() {
  return <WhyTimesDiffer />;
}
