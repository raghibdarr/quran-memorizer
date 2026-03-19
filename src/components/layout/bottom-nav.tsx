'use client';

import { usePathname } from 'next/navigation';
import { useReviewStore } from '@/stores/review-store';
import { HomeIcon, BookIcon, BarChartIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/review', label: 'Review', Icon: BookIcon, showBadge: true },
  { href: '/progress', label: 'Progress', Icon: BarChartIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  const cards = useReviewStore((s) => s.cards);

  // Count ayahs that are weak (quality 0-2) or shaky (quality 3)
  const attentionCount = cards.filter((c) => c.lastQuality < 4 && c.lastQuality >= 0 && c.lastReview > 0).length;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-foreground/5 bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors',
                isActive ? 'text-teal' : 'text-muted hover:text-teal'
              )}
            >
              <div className="relative">
                <item.Icon size={20} />
                {item.showBadge && attentionCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-white">
                    {attentionCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
