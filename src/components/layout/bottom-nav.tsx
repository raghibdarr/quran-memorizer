'use client';

import Link from '@/components/app-link';
import { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useReviewQueue } from '@/hooks/use-review-queue';
import { HomeIcon, BookIcon, StarIcon, BarChartIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';

const NAV_ITEMS = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/review', label: 'Review', Icon: BookIcon },
  { href: '/essentials', label: 'Essentials', Icon: StarIcon },
  { href: '/progress', label: 'Progress', Icon: BarChartIcon },
];

/** Tab that owns a path: sections own their sub-pages; everything else (surah,
 *  lesson, juz, plan screens) lives under Home */
function activeIndex(pathname: string): number {
  const i = NAV_ITEMS.findIndex((item) => item.href !== '/' && pathname.startsWith(item.href));
  return i === -1 ? 0 : i;
}

// Each page renders its own BottomNav, so it REMOUNTS on every tab switch — a CSS
// transition never sees a change. The last active tab is remembered here (module
// scope survives client-side navigation) and the new instance animates from it.
let lastActiveIndex: number | null = null;
// A page can swap its BottomNav again mid-slide (e.g. a loading shell handing over
// to the loaded page). The in-flight slide is remembered so the replacement
// instance picks it up where it was instead of snapping to the end.
let inflight: { from: number; to: number; start: number } | null = null;

function slideKeyframes(from: number, to: number): Keyframe[] {
  const distance = Math.abs(to - from);
  return [
    { transform: `translateX(${from * 100}%) scale(1, 1)` },
    { transform: `translateX(${((from + to) / 2) * 100}%) scale(${1 + 0.14 * Math.min(distance, 3)}, 0.9)`, offset: 0.45 },
    { transform: `translateX(${to * 100}%) scale(1, 1)` },
  ];
}
const slideDuration = (from: number, to: number) => 380 + 40 * Math.min(Math.abs(to - from), 3);
const ICON_POP_DELAY = 120;
const ICON_POP_DURATION = 360;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Floating glass tab bar (owner direction 2026-09-26). A frosted pill hovering
 * above the home indicator — content scrolls visibly behind it — with the active
 * tab on a tinted glass pill that SLIDES between tabs, stretching slightly in
 * flight like a drop of liquid glass, and the new tab's icon pops in.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { dueCount } = useReviewQueue();
  const active = activeIndex(pathname);
  const pillRef = useRef<HTMLSpanElement>(null);
  const iconRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useLayoutEffect(() => {
    const prev = lastActiveIndex;
    lastActiveIndex = active;
    const pill = pillRef.current;
    if (prev === null || !pill || prefersReducedMotion()) return;

    let from: number;
    let elapsed = 0;
    if (prev !== active) {
      from = prev;
      inflight = { from, to: active, start: performance.now() };
    } else if (inflight && inflight.to === active && performance.now() - inflight.start < slideDuration(inflight.from, active)) {
      from = inflight.from;
      elapsed = performance.now() - inflight.start;
    } else {
      return;
    }

    const slide = pill.animate(slideKeyframes(from, active), {
      duration: slideDuration(from, active),
      easing: 'cubic-bezier(.32,.72,0,1)',
    });
    slide.currentTime = elapsed;
    if (elapsed < ICON_POP_DELAY + ICON_POP_DURATION) {
      const pop = iconRefs.current[active]?.animate(
        [{ transform: 'scale(0.82)' }, { transform: 'scale(1)' }],
        { duration: ICON_POP_DURATION, delay: ICON_POP_DELAY, easing: 'cubic-bezier(.34,1.45,.64,1)', fill: 'backwards' },
      );
      if (pop) pop.currentTime = elapsed;
    }
  }, [active]);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 z-50 px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
    >
      <div
        // Named so screen transitions leave it anchored (and slide it away into
        // flows). The name must sit on the glass itself: a view-transition-name
        // makes its element a backdrop root, so on an ANCESTOR it would leave the
        // blur nothing to sample and the glass would be see-through, not frosted.
        style={{ viewTransitionName: 'tab-bar' }}
        className={cn(
          'relative mx-auto flex max-w-md rounded-full p-1.5',
          // Glass: translucent paper + blur + saturation, a hairline highlight edge,
          // and a SOFT lift (the one place a blur shadow belongs — it floats)
          'border border-white/60 bg-card/85 backdrop-blur-2xl backdrop-saturate-150',
          'shadow-[0_10px_30px_-6px_rgb(0_0_0/0.18),0_2px_6px_rgb(0_0_0/0.06)]',
          'dark:border-white/10 dark:bg-card/80 dark:shadow-[0_10px_30px_-6px_rgb(0_0_0/0.6)]',
        )}
      >
        {/* The gliding active pill */}
        <span
          ref={pillRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-1.5 left-1.5 rounded-full border border-white/50 bg-teal/15 dark:border-white/10 dark:bg-teal/25"
          style={{ width: `calc((100% - 0.75rem) / ${NAV_ITEMS.length})`, transform: `translateX(${active * 100}%)` }}
        />

        {NAV_ITEMS.map((item, i) => {
          const isActive = i === active;
          const showBadge = item.href === '/review' && dueCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={isActive ? undefined : haptic.selection}
              className={cn(
                'relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 transition-colors',
                isActive ? 'text-teal' : 'text-muted hover:text-foreground',
              )}
            >
              <span className="relative" ref={(el) => { iconRefs.current[i] = el; }}>
                <item.Icon size={21} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal px-1 text-[9px] font-bold text-on-teal ring-2 ring-card">
                    {dueCount > 99 ? '99+' : dueCount}
                  </span>
                )}
              </span>
              <span className={cn('text-[10.5px] leading-none', isActive ? 'font-semibold' : 'font-medium')}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
