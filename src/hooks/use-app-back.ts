'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { animatedHistoryBack, canGoBack, markGoingBack, recordNavigation } from '@/lib/nav-history';
import { NAV_BACK, isFullScreenFlow } from '@/lib/nav';

/** Mounted once (Providers): keeps the in-app history stack and marks browser-initiated backs */
export function useNavHistoryTracking() {
  // Pathname only (useSearchParams at the root would opt every page out of
  // static rendering); the full URL is read from location when it changes
  const pathname = usePathname();

  useEffect(() => {
    recordNavigation(window.location.pathname + window.location.search);
    // Full-screen flows have no tab bar — bottom-pinned UI reclaims the space
    if (isFullScreenFlow(pathname)) document.documentElement.dataset.flow = '';
    else delete document.documentElement.dataset.flow;
  }, [pathname]);

  useEffect(() => {
    const onPop = () => markGoingBack('back');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}

/**
 * THE back action (M11b): pop the in-app history when there is one — so the
 * hardware back button and this button agree — else navigate to `fallbackHref`
 * (the screen's parent) with a pop animation.
 */
export function useAppBack(fallbackHref: string) {
  const router = useRouter();
  return useCallback(() => {
    if (canGoBack()) {
      animatedHistoryBack('back');
    } else {
      router.replace(fallbackHref, { transitionTypes: [NAV_BACK] });
    }
  }, [router, fallbackHref]);
}
