'use client';

import { Fragment, useState } from 'react';
import type { Ayah } from '@/types/quran';
import { cn } from '@/lib/cn';
import { useSettingsStore } from '@/stores/settings-store';
import sources from '@/data/translation-sources.json';

export type TranslationId = 'saheeh' | 'clear';

export const TRANSLATIONS: Record<TranslationId, { name: string; credit: string }> = {
  saheeh: { name: sources.saheeh.name, credit: `${sources.saheeh.name}, from ${sources.saheeh.source}` },
  clear: { name: sources.clear.name, credit: `Translation by ${sources.clear.translator}, ClearQuran.com` },
};

/** The chosen translation's text for an ayah (Saheeh when the other is missing) */
export function translationOf(ayah: Pick<Ayah, 'translation' | 'translationClear'>, id: TranslationId = 'saheeh'): string {
  return id === 'clear' && ayah.translationClear ? ayah.translationClear : ayah.translation;
}

/** For quoting (copy, share, search): the words without footnote markers like [2] */
export function plainTranslation(text: string): string {
  return text.replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

export function useTranslationId(): TranslationId {
  return useSettingsStore((s) => s.translationId ?? 'saheeh');
}

/**
 * An ayah's translation as published. Saheeh International (QuranEnc) carries
 * footnote markers; each becomes a small tappable number that opens its note
 * below, so the text is shown unchanged as QuranEnc's terms ask.
 */
export default function TranslationText({ ayah, className }: { ayah: Ayah; className?: string }) {
  const id = useTranslationId();
  const text = translationOf(ayah, id);
  const notes = id === 'saheeh' ? ayah.footnotes : undefined;
  const [open, setOpen] = useState<string | null>(null);
  if (!text) return null;

  const parts = text.split(/\[(\d+)\]/);
  const order = parts.filter((_, i) => i % 2 === 1);
  return (
    <div className={className}>
      <p>
        {parts.map((part, i) => {
          if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
          const n = order.indexOf(part) + 1;
          if (!notes?.[part]) return null;
          return (
            <button
              key={i}
              type="button"
              // The ayah card behind it plays on tap; a note is just a note
              onClick={(e) => { e.stopPropagation(); setOpen(open === part ? null : part); }}
              aria-expanded={open === part}
              aria-label={`Note ${n}`}
              className={cn('mx-px inline-flex min-h-6 min-w-6 -translate-y-1.5 items-center justify-center rounded-full px-1 align-baseline text-[11px] font-semibold not-italic', open === part ? 'bg-teal text-on-teal' : 'text-teal')}
              data-footnote={part}
            >
              {n}
            </button>
          );
        })}
      </p>
      {open && notes?.[open] && (
        <p className="mx-auto mt-2 max-w-prose rounded-xl bg-foreground/[0.04] px-3 py-2 text-left text-xs not-italic leading-relaxed text-foreground/80">
          {notes[open]}
        </p>
      )}
    </div>
  );
}
