'use client';

import { usePathname } from 'next/navigation';
import { HomeIcon, BookIcon, BarChartIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/review', label: 'Review', Icon: BookIcon },
  { href: '/progress', label: 'Progress', Icon: BarChartIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

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
              <item.Icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
