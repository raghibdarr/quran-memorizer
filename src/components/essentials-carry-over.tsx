'use client';

import { useEffect } from 'react';

/**
 * Carries memorised Essentials items over to seeded deen cards for everyone,
 * not only people who open the adhkar screens (HANDOFF adhkar-duas 2). The
 * migration is idempotent and loads by dynamic import a few seconds after the
 * app opens, so Home's first load is unchanged. Renders nothing.
 */
export function EssentialsCarryOver() {
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      // Only people with something memorised in Essentials have anything to carry over
      let raw: string | null = null;
      try {
        raw = localStorage.getItem('quran-essentials');
      } catch {
        return;
      }
      if (!raw || !raw.includes('"memorized"') || raw.includes('"memorized":{}')) return;
      import('@/components/adhkar/use-migration')
        .then((m) => (live ? m.runEssentialsMigration() : 0))
        .catch(() => {});
    }, 4000);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);
  return null;
}
