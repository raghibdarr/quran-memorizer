'use client';

import { useState } from 'react';
import type { Position, School } from '@/types/deen';
import { cn } from '@/lib/cn';
import { workTitle } from './registry-names';
import { RichText } from './term';

export const SCHOOL_ORDER: readonly School[] = ['hanafi', 'maliki', 'shafii', 'hanbali'];

export const SCHOOL_NAME: Record<School, string> = {
  hanafi: 'Hanafi',
  maliki: 'Maliki',
  shafii: "Shafi'i",
  hanbali: 'Hanbali',
};

/** The user's school first (if set), the rest in the usual order; nothing is dropped */
export function orderPositions(positions: Position[], school: School | null): Position[] {
  const rank = (p: Position) => (p.school === school ? -1 : SCHOOL_ORDER.indexOf(p.school));
  return [...positions].sort((a, b) => rank(a) - rank(b));
}

function PositionRow({ position, mine }: { position: Position; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const source = `${workTitle(position.source.work)}, ${position.source.location}`;
  return (
    <li className={cn('rounded-xl border px-3.5 py-3', mine ? 'border-teal/40 bg-teal/5' : 'border-foreground/10 bg-card')} data-school={position.school}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-foreground">{SCHOOL_NAME[position.school]}</span>
        {mine && <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[11px] font-semibold text-teal">Your school</span>}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-foreground">
        <RichText text={position.text} />
      </p>
      <p className="mt-1.5 text-xs text-muted">
        {position.quote ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="-my-3 py-3 text-left underline decoration-foreground/20 underline-offset-2 hover:text-foreground"
          >
            {source}
            <span className="sr-only">{open ? ' (hide the Arabic)' : ' (show the Arabic)'}</span>
          </button>
        ) : (
          source
        )}
      </p>
      {open && position.quote && (
        <p className="arabic-text mt-1 rounded-lg bg-foreground/[0.04] px-3 py-1 text-base text-foreground" lang="ar">
          {position.quote}
        </p>
      )}
    </li>
  );
}

/**
 * Where the four schools differ (spec 1.7, 5.6): every position with its
 * primer citation, the user's school first if they chose one, never hiding the
 * others and never picking a winner.
 */
export function PositionsTable({ positions, school, className }: { positions: Position[]; school: School | null; className?: string }) {
  const ordered = orderPositions(positions, school);
  return (
    <div className={className}>
      <ul className="space-y-2" aria-label="What each school holds">
        {ordered.map((p) => (
          <PositionRow key={p.school} position={p} mine={p.school === school} />
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Each school&apos;s position is from its standard primer. Tap a source to see its Arabic.</p>
    </div>
  );
}

export default PositionsTable;
