'use client';

import { formatQuranLead, type HijriEvent } from '@/lib/hijri/events';
import { cn } from '@/lib/cn';

/** One occasion: title, an optional date line, the plain description and its citation when there is one */
export default function EventRow({ event, when, className }: { event: HijriEvent; when?: string; className?: string }) {
  const cite = [event.quran ? formatQuranLead(event.quran) : '', event.citation].filter(Boolean).join(' · ');
  return (
    <li className={cn('flex gap-3 py-3', className)} data-event={event.id}>
      <span
        aria-hidden
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', event.voluntaryFast ? 'bg-teal' : 'bg-gold')}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-semibold text-foreground">{event.title}</span>
          {when && <span className="text-xs text-muted tabular-nums">{when}</span>}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-muted">{event.description}</span>
        {cite && <span className="mt-1 block text-xs text-teal">{cite}</span>}
      </span>
    </li>
  );
}
