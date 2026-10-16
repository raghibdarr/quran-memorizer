'use client';

import { useState } from 'react';
import type { Ayah } from '@/types/quran';
import BottomSheet from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { shareAyahCard } from '@/lib/share-image';
import { isNative } from '@/lib/native';
import { HIGHLIGHT_COLORS, NOTE_MAX, ayahKey, useReaderStore, type HighlightColor } from '@/stores/reader-store';
import { TRANSLATIONS, plainTranslation, translationOf, useTranslationId, type TranslationId } from '@/components/ui/translation-text';

/** Tints for highlighted ayahs, shared by the reader and the bookmarks list */
export const HIGHLIGHT_CLASS: Record<HighlightColor, string> = {
  gold: 'bg-gold/15',
  teal: 'bg-teal/10',
  rose: 'bg-rose-400/15',
  sky: 'bg-sky-400/15',
};
const SWATCH: Record<HighlightColor, string> = {
  gold: 'bg-gold',
  teal: 'bg-teal',
  rose: 'bg-rose-400',
  sky: 'bg-sky-400',
};

export function ayahCopyText(surahName: string, surahId: number, ayah: Ayah, withTranslation: boolean, translationId: TranslationId = 'saheeh'): string {
  const ref = `${surahName} ${surahId}:${ayah.number}`;
  return withTranslation && ayah.translation
    ? `${ayah.textUthmani}\n\n${plainTranslation(translationOf(ayah, translationId))} (${TRANSLATIONS[translationId].name})\n\n${ref}`
    : `${ayah.textUthmani}\n\n${ref}`;
}

/**
 * Per-ayah actions (roadmap #03): bookmark, highlight colour, a note, copy, and
 * play from here. Marks save as they change; the note saves when the sheet closes
 * or the field loses focus. Render it with `key={ayahKey}` so each ayah starts fresh.
 */
export default function AyahMenu({
  open,
  onClose,
  surahId,
  surahName,
  ayah,
  onPlay,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  surahId: number;
  surahName: string;
  ayah: Ayah | null;
  onPlay?: () => void;
  extra?: React.ReactNode;
}) {
  const key = ayah ? ayahKey(surahId, ayah.number) : '';
  const bookmarked = useReaderStore((s) => !!key && !!s.bookmarks[key] && !s.bookmarks[key].deleted);
  const highlight = useReaderStore((s) => (key && s.highlights[key] && !s.highlights[key].deleted ? s.highlights[key].color : null));
  const savedNote = useReaderStore((s) => (key && s.notes[key] && !s.notes[key].deleted ? s.notes[key].text : ''));
  const toggleBookmark = useReaderStore((s) => s.toggleBookmark);
  const setHighlight = useReaderStore((s) => s.setHighlight);
  const setNote = useReaderStore((s) => s.setNote);
  const translationId = useTranslationId();
  const [draft, setDraft] = useState(savedNote);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState<'idle' | 'busy' | 'downloaded'>('idle');

  if (!ayah) return null;

  const saveNote = () => { if (draft !== savedNote) setNote(key, draft); };
  const close = () => { saveNote(); setCopied(false); setSharing('idle'); onClose(); };
  const share = async () => {
    setSharing('busy');
    try {
      const how = await shareAyahCard({
        arabic: ayah.textUthmani,
        translation: plainTranslation(translationOf(ayah, translationId)),
        translationName: TRANSLATIONS[translationId].name,
        reference: `${surahName} ${surahId}:${ayah.number}`,
        dark: document.documentElement.classList.contains('dark'),
      }, `takrar-${surahId}-${ayah.number}.png`);
      setSharing(how === 'downloaded' ? 'downloaded' : 'idle');
    } catch {
      setSharing('idle');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ayahCopyText(surahName, surahId, ayah, true, translationId));
      setCopied(true);
      haptic.success();
    } catch { /* clipboard blocked: nothing to do */ }
  };

  return (
    <BottomSheet open={open} onClose={close} title={`${surahName} ${surahId}:${ayah.number}`} doneButton>
      <div className="space-y-5 pb-2" data-ayah-menu={key}>
        <div className="grid grid-cols-4 gap-2">
          {onPlay && (
            <ActionButton label="Play from here" onClick={() => { close(); onPlay(); }}>
              <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />
            </ActionButton>
          )}
          <ActionButton
            label={bookmarked ? 'Bookmarked' : 'Bookmark'}
            active={bookmarked}
            onClick={() => { haptic.selection(); toggleBookmark(key); }}
            data-bookmark-toggle
          >
            <path d="M6 3h12v18l-6-4-6 4z" fill={bookmarked ? 'currentColor' : 'none'} />
          </ActionButton>
          <ActionButton label={copied ? 'Copied' : 'Copy'} onClick={copy}>
            <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </ActionButton>
          <ActionButton label={sharing === 'busy' ? 'Making…' : sharing === 'downloaded' ? 'Saved' : 'Share'} onClick={() => void share()} data-share-ayah>
            <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><line x1="12" y1="2" x2="12" y2="15" />
          </ActionButton>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">Highlight</p>
          <div className="flex items-center gap-3">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Highlight ${c}`}
                aria-pressed={highlight === c}
                onClick={() => { haptic.selection(); setHighlight(key, highlight === c ? null : c); }}
                className={cn('h-9 w-9 rounded-full ring-offset-2 ring-offset-[var(--color-card)] transition', SWATCH[c], highlight === c ? 'ring-2 ring-foreground/60' : 'opacity-80')}
              />
            ))}
            {highlight && (
              <button type="button" onClick={() => setHighlight(key, null)} className="ml-1 min-h-11 px-2 text-xs font-medium text-muted hover:text-foreground">
                Clear
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={`note-${key}`} className="mb-2 block text-xs font-medium text-muted">Note</label>
          <textarea
            id={`note-${key}`}
            value={draft}
            maxLength={NOTE_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveNote}
            rows={3}
            placeholder="A reflection, a reminder, where you heard it explained…"
            className="w-full resize-y rounded-xl border border-foreground/15 bg-transparent px-3 py-2.5 text-base text-foreground placeholder:text-muted/60 focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
          />
        </div>

        {/* Tafsir, translations and reflections live on Quran.com: link to the ayah
            there rather than copy any of it (its terms; research 2026-10-16) */}
        <a
          href={`https://quran.com/${surahId}:${ayah.number}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!isNative()) return;
            e.preventDefault();
            void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url: `https://quran.com/${surahId}:${ayah.number}` }));
          }}
          className="flex min-h-11 items-center justify-between rounded-xl bg-foreground/[0.04] px-3 text-sm text-foreground"
          data-quran-com
        >
          <span>Tafsir and reflections on Quran.com</span>
          <span aria-hidden className="text-muted">↗</span>
        </a>

        {extra}
      </div>
    </BottomSheet>
  );
}

function ActionButton({ label, active, onClick, children, ...rest }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode } & Record<`data-${string}`, unknown>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'pressable flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium',
        active ? 'bg-gold/15 text-gold-deep' : 'bg-foreground/5 text-foreground',
      )}
      {...rest}
    >
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
      {label}
    </button>
  );
}
