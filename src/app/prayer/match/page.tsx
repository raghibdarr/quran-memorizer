import type { Metadata } from 'next';
import MatchWizard from '@/components/prayer/match/match-wizard';

export const metadata: Metadata = { title: 'Match my mosque · Takrar' };

export default function Page() {
  return <MatchWizard />;
}
