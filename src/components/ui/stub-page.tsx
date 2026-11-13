'use client';

import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import Card from '@/components/ui/card';
import { ClockIcon } from '@/components/ui/icons';

interface StubPageProps {
  /** The screen's name, as its header shows it */
  title: string;
  /** Where Back goes when there is no in-app history (the screen's parent) */
  back?: string;
  /** A tab root (no Back; the settings and account buttons instead) */
  root?: boolean;
  /** A tab root's line under its title, as Home and Learn have */
  subtitle?: string;
  /** One plain line about what the screen will do, shown in the placeholder card */
  note?: string;
  children?: React.ReactNode;
}

/**
 * A placeholder for an all-in-one screen that hasn't landed yet (spec 2.2). Each
 * route ships as one of these until its package replaces the page, so every
 * route exists, deep-links and cold-loads from day one.
 */
export default function StubPage({ title, back = '/', root = false, subtitle, note, children }: StubPageProps) {
  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-stub-page={title}>
      {root ? (
        <header className="sticky top-[var(--safe-top)] z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{title}</h1>
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              <SettingsPanel />
              <UserButton />
            </div>
          </div>
        </header>
      ) : (
        <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
          {/* Three columns so the title sits on the true centre, whatever Back says */}
          <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
            <BackButton fallback={back} className="justify-self-start" />
            <h1 className="truncate text-center text-sm font-semibold text-teal">{title}</h1>
            <span aria-hidden />
          </div>
        </div>
      )}

      <main className={`mx-auto max-w-2xl space-y-3 px-4 ${root ? 'pt-3' : 'pt-5'}`}>
        <Card className="px-5 py-8 text-center">
          <ClockIcon size={28} className="mx-auto text-teal" />
          <p className="mx-auto mt-3 max-w-[17rem] text-sm leading-relaxed text-muted">{note ?? 'Coming soon.'}</p>
        </Card>
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
