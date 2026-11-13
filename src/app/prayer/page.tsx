import type { Metadata } from 'next';
import Link from '@/components/app-link';
import StubPage from '@/components/ui/stub-page';
import { readyTools } from '@/lib/prayer/tools';

export const metadata: Metadata = { title: 'Prayer · Takrar' };

// Stub (foundations, all-in-one spec 2.2): the prayer-times package replaces this
// page with the real hub, rendering the four slots in src/components/prayer/slots.
export default function Page() {
  return (
    <StubPage title="Prayer" root note="Prayer times, worked out on your phone, are on their way.">
      <ul className="mt-4 grid grid-cols-2 gap-3" data-prayer-tools>
        {readyTools().map((t) => (
          <li key={t.id}>
            <Link href={t.href} className="pressable block h-full rounded-2xl border border-foreground/10 bg-card p-4">
              <span className="block text-sm font-semibold text-foreground">{t.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{t.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </StubPage>
  );
}
