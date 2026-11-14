import type { Metadata } from 'next';
import GlossaryScreen from './glossary-client';

export const metadata: Metadata = { title: 'Glossary · Takrar' };

export default function Page() {
  return <GlossaryScreen />;
}
