'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { animatedHistoryBack, canGoBack } from '@/lib/nav-history';
import { routeDepth } from '@/lib/nav';
import { isNative, nativePlatform } from '@/lib/native';

const EDGE_PX = 24; // gesture must start within this gutter
const COMMIT_FRACTION = 0.35; // … and travel this share of the width
const COMMIT_VELOCITY = 0.5; // … or flick faster than this (px/ms)

/** iOS app, or the installed iOS web app. Android has a system back gesture (it
 *  arrives as a history back and animates via the popstate path), and Safari in
 *  a browser tab owns the edge swipe itself. */
function edgeSwipeWanted(): boolean {
  if (isNative()) return nativePlatform() === 'ios';
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || localStorage.getItem('qa-edge-swipe') === '1';
}

/**
 * Interactive edge-swipe-back (M11b): the screen tracks the finger 1:1 from the
 * left edge; release past a third of the width (or with a flick) pops the stack,
 * otherwise it springs back. Tab roots don't swipe — like a native tab bar, the
 * stack is per section.
 */
export default function EdgeSwipeBack() {
  const pathname = usePathname();

  useEffect(() => {
    if (!edgeSwipeWanted() || routeDepth(pathname) === 0) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let active = false;
    let decided = false;
    let screen: HTMLElement | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || t.clientX > EDGE_PX || !canGoBack()) return;
      startX = t.clientX;
      startY = t.clientY;
      startT = performance.now();
      active = true;
      decided = false;
      screen = document.querySelector<HTMLElement>('[data-screen]');
    };

    const onMove = (e: TouchEvent) => {
      if (!active || !screen) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        decided = true;
        if (Math.abs(dy) > dx) { active = false; return; } // a vertical scroll, not ours
        screen.style.transition = 'none';
        screen.style.boxShadow = '-12px 0 32px rgb(0 0 0 / 0.14)';
        screen.style.willChange = 'transform';
      }
      e.preventDefault();
      screen.style.transform = `translateX(${Math.max(0, dx)}px)`;
    };

    const onEnd = (e: TouchEvent) => {
      if (!active || !screen) return;
      active = false;
      const el = screen;
      const dx = Math.max(0, (e.changedTouches[0]?.clientX ?? startX) - startX);
      const velocity = dx / Math.max(1, performance.now() - startT);
      const commit = decided && (dx > window.innerWidth * COMMIT_FRACTION || velocity > COMMIT_VELOCITY);
      const settle = () => {
        el.style.transform = '';
        el.style.boxShadow = '';
        el.style.willChange = '';
      };
      if (commit) {
        el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(100%)' }], {
          duration: 180, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards',
        }).finished.then(() => animatedHistoryBack('swipe'));
      } else if (decided) {
        el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], {
          duration: 260, easing: 'cubic-bezier(.34,1.45,.64,1)',
        }).finished.then(settle);
        el.style.transform = '';
      } else {
        settle();
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [pathname]);

  return null;
}
