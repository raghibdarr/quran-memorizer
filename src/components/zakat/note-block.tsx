'use client';

import { useState } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { zakatNote, type ZakatNoteId } from '@/lib/zakat/notes';

/** The honest status line every explainer carries until a scholar reviews it (spec 1.8) */
export function UnreviewedLine({ className }: { className?: string }) {
  return <p className={cn('text-xs text-muted', className)}>Source-checked. Not yet reviewed by a scholar.</p>;
}

/** Only notes that passed the source check are shown (spec 5.5 rule 1); a draft stays out until it does */
export function isShownNote(id: ZakatNoteId): boolean {
  return zakatNote(id).status !== 'draft';
}

/**
 * One explainer note from src/data/zakat-notes.json: the statement, the
 * positions side by side when the schools differ (none picked), and where to
 * check it. Collapsed by default to a quiet text row so the form stays calm;
 * the tinted panel appears only once it is open.
 */
export default function NoteBlock({ id, summary, open = false }: { id: ZakatNoteId; summary?: string; open?: boolean }) {
  const note = zakatNote(id);
  const shown = note.status !== 'draft';
  // Opened for the user when a choice is waiting on it; it then stays as they
  // leave it, so making the choice doesn't fold the positions away mid-read
  const [prompted, setPrompted] = useState(open);
  if (open && !prompted) setPrompted(true);
  if (!shown) return null;
  return (
    <details className="group mt-2 rounded-xl open:mt-3 open:bg-foreground/[0.03]" open={prompted} data-note={id}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl text-sm font-medium text-teal group-open:px-3.5 [&::-webkit-details-marker]:hidden">
        <span>{summary ?? (note.kind === 'differs' ? 'Where scholars differ' : 'Why')}</span>
        <ChevronDownIcon
          size={16}
          className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="px-3.5 pb-3">
        <p className="text-sm leading-relaxed text-foreground">{note.text}</p>
        {note.positions && (
          <dl className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {note.positions.map((p) => (
              <div key={p.by} className="rounded-lg bg-card px-3 py-2 [.dark_&]:border [.dark_&]:border-foreground/10">
                <dt className="text-xs font-semibold text-teal">{p.by}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-foreground/85">{p.text}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 border-t border-foreground/10 pt-2.5 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-foreground/80">Where to check:</span> {note.sourceLead}
        </p>
        {note.status !== 'scholar-reviewed' && <UnreviewedLine className="mt-1.5" />}
      </div>
    </details>
  );
}
