'use client';

import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';

interface StubPageProps {
  /** The screen's name, as its header shows it */
  title: string;
  /** Where Back goes when there is no in-app history (the screen's parent) */
  back?: string;
  /** A tab root (no Back; the settings and account buttons instead) */
  root?: boolean;
  /** One line under the title */
  note?: string;
  children?: React.ReactNode;
}

/**
 * A placeholder for an all-in-one screen that hasn't landed yet (spec 2.2). Each
 * route ships as one of these until its package replaces the page, so every
 * route exists, deep-links and cold-loads from day one.
 */
export default function StubPage({ title, back = '/', root = false, note, children }: StubPageProps) {
  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-stub-page={title}>
      {root ? (
        <header className="sticky top-[var(--safe-top)] z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <div className="flex items-center gap-2">
              <SettingsPanel />
              <UserButton />
            </div>
          </div>
        </header>
      ) : (
        <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <BackButton fallback={back} />
            <h1 className="text-sm font-semibold text-teal">{title}</h1>
            <span className="w-11" />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-2xl px-4 pt-6">
        <div className="rounded-2xl border border-foreground/10 bg-card px-5 py-8 text-center">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{note ?? 'This part of Takrar is on its way.'}</p>
        </div>
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
