'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useReviewQueue } from '@/hooks/use-review-queue';
import { HomeIcon, BookIcon, StarIcon, BarChartIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

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
    const from = lastActiveIndex;
    lastActiveIndex = active;
    const pill = pillRef.current;
    if (from === null || from === active || !pill || prefersReducedMotion()) return;
    const distance = Math.abs(active - from);
    pill.animate(
      [
        { transform: `translateX(${from * 100}%) scale(1, 1)` },
        { transform: `translateX(${((from + active) / 2) * 100}%) scale(${1 + 0.14 * Math.min(distance, 3)}, 0.9)`, offset: 0.45 },
        { transform: `translateX(${active * 100}%) scale(1, 1)` },
      ],
      { duration: 380 + 40 * Math.min(distance, 3), easing: 'cubic-bezier(.32,.72,0,1)' },
    );
    iconRefs.current[active]?.animate(
      [{ transform: 'scale(0.82)' }, { transform: 'scale(1)' }],
      { duration: 360, delay: 120, easing: 'cubic-bezier(.34,1.45,.64,1)', fill: 'backwards' },
    );
  }, [active]);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 z-50 px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
    >
      <div
        className={cn(
          'relative mx-auto flex max-w-md rounded-full p-1.5',
          // Glass: translucent paper + blur + saturation, a hairline highlight edge,
          // and a SOFT lift (the one place a blur shadow belongs — it floats)
          'border border-white/60 bg-card/60 backdrop-blur-xl backdrop-saturate-150',
          'shadow-[0_10px_30px_-6px_rgb(0_0_0/0.18),0_2px_6px_rgb(0_0_0/0.06)]',
          'dark:border-white/10 dark:bg-card/55 dark:shadow-[0_10px_30px_-6px_rgb(0_0_0/0.6)]',
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
