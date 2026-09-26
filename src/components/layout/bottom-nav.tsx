'use client';

import Link from 'next/link';

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

export default function BottomNav() {
  const pathname = usePathname();
  const { dueCount } = useReviewQueue();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t-[1.5px] border-foreground/10 bg-card/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-2xl">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const showBadge = item.href === '/review' && dueCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'pressable relative flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors',
                isActive ? 'text-teal' : 'text-muted hover:text-teal'
              )}
            >
              <div className="relative">
                <item.Icon size={22} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal px-1 text-[9px] font-bold text-on-teal">
                    {dueCount > 99 ? '99+' : dueCount}
                  </span>
                )}
              </div>
              <span className={cn('text-[11px]', isActive ? 'font-semibold' : 'font-medium')}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
