'use client';

import Link from '@/components/app-link';
import type { Review } from '@/types/deen';
import { UNREVIEWED_STATUS } from '@/lib/deen/flags';
import { cn } from '@/lib/cn';
import { reviewerById } from './registry-names';
import { formatIsoDate } from './text';

/** The status line for an item (spec 1.8): honest about who has checked it */
export function reviewStatusText(review: Review): string {
  if (review.status === 'scholar-reviewed' && review.by?.length) {
    const names = review.by.map((id) => reviewerById(id)?.name ?? id);
    const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return `Reviewed by ${who}${review.date ? `, ${formatIsoDate(review.date)}` : ''}.`;
  }
  return UNREVIEWED_STATUS;
}

/**
 * "Source-checked. Not yet reviewed by a scholar." until a named reviewer is
 * added, then "Reviewed by <name>, <date>". Opens the method on /sources.
 */
export function ReviewBadge({ review, className }: { review: Review; className?: string }) {
  const reviewed = review.status === 'scholar-reviewed' && !!review.by?.length;
  return (
    <Link
      href="/sources#method"
      data-review-status={review.status}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium',
        reviewed ? 'bg-success/10 text-success' : 'bg-foreground/[0.05] text-muted hover:text-foreground',
        className,
      )}
    >
      <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', reviewed ? 'bg-success' : 'bg-gold')} />
      <span>{reviewStatusText(review)}</span>
    </Link>
  );
}

export default ReviewBadge;
