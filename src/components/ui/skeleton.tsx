import { cn } from '@/lib/cn';

/** Paper-at-rest placeholder with a slow gold shimmer (M11d) — loading states never spin */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} aria-hidden />;
}

/** A column of list-row skeletons */
export function SkeletonRows({ count = 4, rowClassName }: { count?: number; rowClassName?: string }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn('h-[4.25rem]', rowClassName)} />
      ))}
    </div>
  );
}
