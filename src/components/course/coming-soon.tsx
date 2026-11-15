'use client';

import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { ClockIcon, RefreshIcon } from '@/components/ui/icons';

// Card doesn't pass data attributes through, so each hook sits on a wrapper

/** The neutral state while the course is held back or has no unit ready */
export function CourseComingSoon() {
  return (
    <div data-course-coming-soon>
      <Card className="px-5 py-8 text-center">
        <ClockIcon size={28} className="mx-auto text-teal" />
        <p className="mt-3 text-base font-semibold text-foreground">Coming soon</p>
        <p className="mx-auto mt-1 max-w-[18rem] text-sm leading-relaxed text-muted">
          Short lessons on purification and fasting, with their sources, are on their way.
        </p>
      </Card>
    </div>
  );
}

/** The lessons exist but didn't download (a bad connection, or an update in between): say so and offer a retry */
export function CourseLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" data-course-load-failed>
      <Card className="px-5 py-8 text-center">
        <RefreshIcon size={28} className="mx-auto text-teal" />
        <p className="mt-3 text-base font-semibold text-foreground">The lessons couldn’t be loaded</p>
        <p className="mx-auto mt-1 max-w-[18rem] text-sm leading-relaxed text-muted">
          Check your connection and try again. Your progress is safe.
        </p>
        <Button className="mt-5 min-h-12" onClick={onRetry}>
          Try again
        </Button>
      </Card>
    </div>
  );
}

export default CourseComingSoon;
