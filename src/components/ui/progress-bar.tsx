'use client';

import { cn } from '@/lib/cn';

interface ProgressBarProps {
  value: number; // 0-100
  color?: string;
  className?: string;
}

export default function ProgressBar({
  value,
  color = 'bg-teal',
  className,
}: ProgressBarProps) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-foreground/10', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500 ease-out', color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
