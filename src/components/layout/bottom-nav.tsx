'use client';

import { useReviewStore } from '@/stores/review-store';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: '&#127968;' },
  { href: '/review', label: 'Review', icon: '&#128218;', showBadge: true },
  { href: '/progress', label: 'Progress', icon: '&#128200;' },
];

export default function BottomNav() {
  const dueCount = useReviewStore((s) => s.getDueCount());

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-foreground/5 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-lg">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-muted transition-colors hover:text-teal"
          >
            <div className="relative">
              <span
                className="text-xl"
                dangerouslySetInnerHTML={{ __html: item.icon }}
              />
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
