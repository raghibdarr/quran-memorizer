'use client';

import type { ReactNode } from 'react';

/**
 * The screen's actions, pinned to the bottom (as in the course lesson) so the
 * one primary action is in reach on first paint however long the card is.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-cream from-75% to-cream/0 px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]" data-sticky-actions>
      {children}
    </div>
  );
}
