'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAppRoute, normalizeAppUrl } from '@/lib/routes';

const GUARD_KEY = 'shell-route-recovery';
const GUARD_WINDOW_MS = 3_000;
const GUARD_TRIP_COUNT = 4;

/**
 * Called by the HOME page only. The native shells (Capacitor, iOS + Android)
 * answer every extensionless path with the root index.html, so a full page load
 * at a deep URL — a WebView reload, a notification deep link — renders Home
 * under the wrong address. If Home finds itself mounted anywhere but "/", it
 * hands off to the real route client-side. On the web every route has its own
 * HTML file, so this never fires there.
 *
 * Two guards against an infinite reload loop (asking the router for a page the
 * export doesn't contain makes Next fall back to a full load → Home → retry):
 * only known routes are recovered, and a path that bounces back repeatedly
 * within seconds is abandoned for Home.
 */
export function useShellRouteRecovery() {
  const router = useRouter();
  useEffect(() => {
    const { pathname, search } = window.location;
    if (pathname === '/' || pathname === '/index.html') return;

    const target = normalizeAppUrl(pathname + search);
    const targetPath = target.split('?')[0];
    if (!isAppRoute(targetPath)) {
      router.replace('/');
      return;
    }

    try {
      // A real loop re-enters several times a SECOND; a person reloading a page
      // that recovered fine does not — so trip only on repeated hits in a burst
      const prev = JSON.parse(sessionStorage.getItem(GUARD_KEY) ?? 'null') as { target: string; at: number; n: number } | null;
      const burst = prev && prev.target === target && Date.now() - prev.at < GUARD_WINDOW_MS ? prev.n + 1 : 1;
      if (burst >= GUARD_TRIP_COUNT) {
        sessionStorage.removeItem(GUARD_KEY);
        router.replace('/');
        return;
      }
      sessionStorage.setItem(GUARD_KEY, JSON.stringify({ target, at: Date.now(), n: burst }));
    } catch {
      // storage unavailable — the known-route check above still prevents loops
    }
    router.replace(target);
  }, [router]);
}
