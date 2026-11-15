import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The app's two section headings, so every screen reads alike:
 * - SectionLabel: small, uppercase, muted, for groups of settings or rows
 *   ("Place", "Source", "Coming up · expected").
 * - SectionTitle: bold ink sentence case, for content sections ("At iftar",
 *   "Today's prices").
 * Page titles live in the header bar; an in-page H1 only on wizard steps, in ink.
 */
export function SectionLabel({ children, id, as: Tag = 'h2', className }: { children: ReactNode; id?: string; as?: 'h2' | 'h3' | 'p'; className?: string }) {
  return (
    <Tag id={id} className={cn('px-1 text-[11px] font-bold uppercase tracking-wider text-muted', className)}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, id, as: Tag = 'h2', className }: { children: ReactNode; id?: string; as?: 'h2' | 'h3'; className?: string }) {
  return (
    <Tag id={id} className={cn('px-1 text-base font-bold text-foreground', className)}>
      {children}
    </Tag>
  );
}
