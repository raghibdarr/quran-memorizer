'use client';

import BottomSheet from '@/components/ui/bottom-sheet';
import { SCHOOL_NAME, SCHOOL_ORDER } from '@/components/deen/positions-table';
import { useDeenStore } from '@/stores/deen-store';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import type { School } from '@/types/deen';

/** Device-only note that the school question was answered or skipped (asked once) */
const ASKED_KEY = 'takrar-course-school-asked';

export function schoolAskedBefore(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function noteSchoolAsked() {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    // Private mode: it may ask again next time, which is harmless
  }
}

/**
 * "Which school do you follow?" (spec 5.7): it only changes the order positions
 * are listed in and which school's card is added. Skippable: "Show me all four".
 */
export function SchoolSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const school = useDeenStore((s) => s.school);
  const setSchool = useDeenStore((s) => s.setSchool);
  const choose = (s: School | null) => {
    setSchool(s);
    noteSchoolAsked();
    haptic.selection();
    onClose();
  };
  const close = () => {
    noteSchoolAsked();
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} title="Do you follow a school?">
      <div className="space-y-4 pb-2" data-school-sheet>
        <p className="text-sm leading-relaxed text-muted">
          Where the four schools differ, the lessons show all four. If you follow one, its position is listed first, and the review card
          for it is the one added. The others stay in view.
        </p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Schools">
          {SCHOOL_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={school === s}
              onClick={() => choose(s)}
              className={cn(
                'min-h-12 rounded-xl border px-3 text-sm font-semibold transition-colors',
                school === s ? 'border-teal bg-teal/10 text-teal' : 'border-foreground/15 bg-card text-foreground hover:bg-foreground/[0.04]',
              )}
            >
              {SCHOOL_NAME[s]}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={school === null}
          onClick={() => choose(null)}
          className="min-h-11 w-full rounded-xl text-sm font-semibold text-muted hover:bg-foreground/5 hover:text-foreground"
        >
          Show me all four
        </button>
        <p className="text-xs text-muted">You can change this from the course page at any time.</p>
      </div>
    </BottomSheet>
  );
}

export default SchoolSheet;
