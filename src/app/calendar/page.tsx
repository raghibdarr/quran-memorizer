import type { Metadata } from 'next';
import CalendarClient from '@/components/calendar/calendar-client';

export const metadata: Metadata = { title: 'Hijri calendar · Takrar' };

export default function Page() {
  return <CalendarClient />;
}
