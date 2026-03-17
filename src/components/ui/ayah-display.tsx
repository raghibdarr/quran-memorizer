'use client';

import { cn } from '@/lib/cn';
import type { Ayah, Word } from '@/types/quran';
import { useSettingsStore } from '@/stores/settings-store';

interface AyahDisplayProps {
  ayah: Ayah;
  highlightWords?: number[];      // positions to highlight
  blankWords?: number[];           // positions to blank out
  dimmed?: boolean;
  showTranslation?: boolean;
  showTransliteration?: boolean;   // override store setting (e.g. hide during tests)
  onWordClick?: (word: Word) => void;
  className?: string;
}

export default function AyahDisplay({
  ayah,
  highlightWords = [],
  blankWords = [],
  dimmed = false,
  showTranslation,
  showTransliteration,
  onWordClick,
  className,
}: AyahDisplayProps) {
  const transliterationEnabled = useSettingsStore((s) => s.transliterationEnabled);
  const translationEnabled = useSettingsStore((s) => s.translationEnabled);
  const shouldShowTranslation = showTranslation ?? translationEnabled;
  const shouldShowTransliteration = showTransliteration ?? transliterationEnabled;

  const actualWords = ayah.words.filter((w) => w.charType === 'word');

  return (
    <div className={cn('space-y-3', dimmed && 'opacity-30', className)}>
      {/* Arabic text */}
      <div className="arabic-text flex flex-wrap justify-center gap-x-3 gap-y-1 text-3xl leading-loose">
        {actualWords.map((word) => {
          const isHighlighted = highlightWords.includes(word.position);
          const isBlanked = blankWords.includes(word.position);

          return (
            <span
              key={word.position}
              onClick={() => onWordClick?.(word)}
              className={cn(
                'inline-block rounded px-1 py-0.5 transition-colors',
                onWordClick && 'cursor-pointer hover:bg-gold/10',
                isHighlighted && 'bg-gold/20 text-teal',
                isBlanked && 'bg-foreground/10 text-transparent select-none'
              )}
            >
              {isBlanked ? '⬜⬜⬜' : word.textUthmani}
            </span>
          );
        })}
      </div>

      {/* Transliteration — prefer ayah-level (waqf-style) over word-level concatenation */}
      {shouldShowTransliteration && (
        <p className="text-center text-sm text-muted">
          {ayah.transliteration || actualWords.map((w) => w.transliteration).filter(Boolean).join(' ')}
        </p>
      )}

      {/* Translation */}
      {shouldShowTranslation && ayah.translation && (
        <p className="text-center text-sm italic text-muted">
          {ayah.translation}
        </p>
      )}
    </div>
  );
}
