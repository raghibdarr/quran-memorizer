'use client';

import { useReviewStore } from '@/stores/review-store';
import { HomeIcon, BookIcon, BarChartIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/review', label: 'Review', Icon: BookIcon, showBadge: true },
  { href: '/progress', label: 'Progress', Icon: BarChartIcon },
];

export default function BottomNav() {
  const cards = useReviewStore((s) => s.cards);
  const dueCount = cards.filter((c) => c.nextReview <= Date.now()).length;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-foreground/5 bg-white/95 backdrop-blur-sm dark:bg-[#222]/95 dark:border-white/10">
      <div className="mx-auto flex max-w-lg">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-muted transition-colors hover:text-teal"
          >
            <div className="relative">
              <item.Icon size={20} />
              {item.showBadge && dueCount > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-white">
                  {dueCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
