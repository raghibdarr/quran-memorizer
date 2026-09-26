'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeAppUrl } from '@/lib/routes';

/**
 * Called by the HOME page only. The native shells (Capacitor, iOS + Android)
 * answer every extensionless path with the root index.html, so a full page load
 * at a deep URL — a WebView reload, a notification deep link — renders Home
 * under the wrong address. If Home finds itself mounted anywhere but "/", it
 * hands off to the real route client-side. On the web every route has its own
 * HTML file, so this never fires there.
 */
export function useShellRouteRecovery() {
  const router = useRouter();
  useEffect(() => {
    const { pathname, search } = window.location;
    if (pathname !== '/' && pathname !== '/index.html') {
      router.replace(normalizeAppUrl(pathname + search));
    }
  }, [router]);
}
