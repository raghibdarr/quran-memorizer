'use client';

import BackButton from '@/components/ui/back-button';

/** The drill-down header the Prayer tools share (same as StubPage's): Back, centred title */
export default function ScreenHeader({ title, back }: { title: string; back: string }) {
  return (
    <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
      {/* Three columns so the title sits on the true centre, whatever Back says */}
      <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
        <BackButton fallback={back} className="justify-self-start" />
        <h1 className="truncate text-center text-sm font-semibold text-teal">{title}</h1>
        <span aria-hidden />
      </div>
    </div>
  );
}
