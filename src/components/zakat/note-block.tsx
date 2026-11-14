'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { zakatNote, type ZakatNoteId } from '@/lib/zakat/notes';

/** The honest status line every explainer carries until a scholar reviews it (spec 1.8) */
export function UnreviewedLine({ className, status = 'draft' }: { className?: string; status?: 'draft' | 'source-checked' }) {
  return (
    <p className={cn('text-xs text-muted', className)}>
      {status === 'draft' ? 'Draft' : 'Source-checked'}. Not yet reviewed by a scholar.
    </p>
  );
}

/**
 * One explainer note from src/data/zakat-notes.json: the statement, the
 * positions side by side when the schools differ (none picked), and where to
 * check it. Collapsed by default under a "Why" line so the form stays calm.
 */
export default function NoteBlock({ id, summary, open = false }: { id: ZakatNoteId; summary?: string; open?: boolean }) {
  const note = zakatNote(id);
  // Opened for the user when a choice is waiting on it; it then stays as they
  // leave it, so making the choice doesn't fold the positions away mid-read
  const [prompted, setPrompted] = useState(open);
  if (open && !prompted) setPrompted(true);
  return (
    <details className="group mt-3 rounded-xl bg-foreground/[0.03] px-3.5 py-2.5" open={prompted} data-note={id}>
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-teal [&::-webkit-details-marker]:hidden">
        <span>{summary ?? (note.kind === 'differs' ? 'Where scholars differ' : 'Why')}</span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
      </summary>
      <div className="pt-1.5 pb-1">
        <p className="text-sm leading-relaxed text-foreground">{note.text}</p>
        {note.positions && (
          <dl className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {note.positions.map((p) => (
              <div key={p.by} className="rounded-lg border border-foreground/10 bg-card px-3 py-2">
                <dt className="text-xs font-semibold text-foreground">{p.by}</dt>
                <dd className="mt-0.5 text-sm leading-snug text-muted">{p.text}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-2.5 text-xs leading-snug text-muted">
          <span className="font-semibold">Where to check:</span> {note.sourceLead}
        </p>
        {note.status !== 'scholar-reviewed' && <UnreviewedLine className="mt-1" status={note.status} />}
      </div>
    </details>
  );
}
