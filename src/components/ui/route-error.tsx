'use client';

import { useEffect } from 'react';
import Link from '@/components/app-link';
import Button from './button';

/**
 * What a screen shows when it throws (the route's error.tsx). Calm, and with a
 * way out that needs no clearing of site data: try again, go home, or, where a
 * store can be the cause, put that one store back to its defaults.
 */
export default function RouteError({
  error,
  reset,
  resetStore,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** A device-only store this screen depends on, offered for a reset */
  resetStore?: { key: string; label: string; note: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const clearStore = () => {
    if (!resetStore) return;
    try {
      localStorage.removeItem(resetStore.key);
    } catch {
      /* storage blocked: the reload still tries again */
    }
    // The store is read when the bundle loads, so start the page afresh
    window.location.reload();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-6" role="alert">
      <div className="w-full max-w-sm space-y-5 text-center">
        <h1 className="text-lg font-bold text-foreground">This screen didn&apos;t open</h1>
        <p className="text-sm leading-relaxed text-muted">Something on this device stopped it loading. Your Quran progress is safe.</p>
        <div className="space-y-2">
          <Button className="w-full" onClick={reset}>
            Try again
          </Button>
          {resetStore && (
            <>
              <Button variant="secondary" className="w-full" onClick={clearStore} data-reset-store={resetStore.key}>
                {resetStore.label}
              </Button>
              <p className="text-xs text-muted">{resetStore.note}</p>
            </>
          )}
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
