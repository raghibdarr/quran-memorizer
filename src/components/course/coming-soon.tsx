import Card from '@/components/ui/card';
import { ClockIcon } from '@/components/ui/icons';

/** The neutral state while the course is held back or has no unit ready */
export function CourseComingSoon() {
  return (
    <Card className="px-5 py-8 text-center" data-course-coming-soon>
      <ClockIcon size={28} className="mx-auto text-teal" />
      <p className="mt-3 text-base font-semibold text-foreground">Coming soon</p>
      <p className="mx-auto mt-1 max-w-[18rem] text-sm leading-relaxed text-muted">
        Short lessons on purification and fasting, with their sources, are on their way.
      </p>
    </Card>
  );
}

export default CourseComingSoon;
