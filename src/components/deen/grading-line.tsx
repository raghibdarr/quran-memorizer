'use client';

import { useState } from 'react';
import type { Grading } from '@/types/deen';
import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { scholarName, workTitle } from './registry-names';
import { GRADE_LABEL, GRADE_TERM } from './text';
import { Term } from './term';

/**
 * A grading, always attributed (spec 5.1): "Hasan: al-Tirmidhi, in al-Jami',
 * after the hadith". The grade word opens its glossary entry; tapping the rest
 * shows the verdict in the scholar's own Arabic, when it was recorded.
 */
export function GradingLine({ grading, className }: { grading: Grading; className?: string }) {
  const [open, setOpen] = useState(false);
  const termId = GRADE_TERM[grading.grade];
  const label = GRADE_LABEL[grading.grade];
  const who = `${scholarName(grading.by)}, in ${workTitle(grading.in)}`;
  return (
    <div className={cn('text-[13px] leading-relaxed text-muted', className)} data-grading={grading.grade}>
      <p>
        <span className="font-semibold text-foreground">{termId ? <Term id={termId}>{label}</Term> : label}</span>
        {': '}
        {grading.quote ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline text-left text-muted hover:text-foreground"
          >
            {who}
            <ChevronDownIcon size={12} className={cn('ml-0.5 inline align-[-1px] transition-transform', open && 'rotate-180')} />
            <span className="sr-only">{open ? ' (hide the Arabic)' : ' (show the Arabic)'}</span>
          </button>
        ) : (
          who
        )}
      </p>
      {open && grading.quote && (
        <p className="arabic-text mt-1 rounded-lg bg-foreground/[0.04] px-3 py-1 text-base text-foreground" lang="ar">
          {grading.quote}
        </p>
      )}
    </div>
  );
}

export default GradingLine;
