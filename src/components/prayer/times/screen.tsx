'use client';

import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';

/** A Prayer sub-screen: Back, a centred title, the content, the tab bar (the app's sub-screen pattern) */
export default function PrayerScreen({
  title,
  back,
  children,
}: {
  title: string;
  /** Where Back goes without in-app history */
  back: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        {/* Three columns so the title sits on the true centre, whatever Back says */}
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback={back} className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">{title}</h1>
          <span aria-hidden />
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">{children}</main>
      <BottomNav />
    </div>
  );
}

/** A small uppercase heading over a group, as the app's other screens use */
export { SectionLabel } from '@/components/ui/section-heading';
