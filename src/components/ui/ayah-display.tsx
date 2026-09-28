'use client';

import { cn } from '@/lib/cn';
import type { Ayah, Word } from '@/types/quran';
import { useSettingsStore } from '@/stores/settings-store';
import { buildAyahWordData } from '@/lib/segments';

interface AyahDisplayProps {
  ayah: Ayah;
  highlightWords?: number[];
  blankWords?: number[];
  dimmed?: boolean;
  showTranslation?: boolean;
  showTransliteration?: boolean;
  onWordClick?: (word: Word) => void;
  /** Word being recited (0-based over real words; -1 = none). When set, the ayah is
   *  drawn word by word in the chosen script so that word can be highlighted. */
  spokenWord?: number;
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
  spokenWord,
  className,
}: AyahDisplayProps) {
  const transliterationEnabled = useSettingsStore((s) => s.transliterationEnabled);
  const translationEnabled = useSettingsStore((s) => s.translationEnabled);
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  const shouldShowTranslation = showTranslation ?? translationEnabled;
  const shouldShowTransliteration = showTransliteration ?? transliterationEnabled;

  const actualWords = ayah.words.filter((w) => w.charType === 'word');
  const hasWordInteraction = highlightWords.length > 0 || blankWords.length > 0 || onWordClick;

  const renderFullAyah = () => {
    if (arabicScript === 'tajweed' && ayah.textUthmaniTajweed) {
      return (
        <div
          className="arabic-text tajweed-text text-center text-4xl leading-loose"
          dangerouslySetInnerHTML={{ __html: ayah.textUthmaniTajweed }}
        />
      );
    }
    if (arabicScript === 'indopak' && ayah.textIndopak) {
      return (
        <p className="arabic-text-indopak text-center text-4xl leading-loose">
          {ayah.textIndopak}
        </p>
      );
    }
    return (
      <p className="arabic-text text-center text-4xl leading-loose">
        {ayah.textUthmani}
      </p>
    );
  };

  const renderWordByWord = () => (
    <div className="arabic-text flex flex-wrap justify-center gap-x-3 gap-y-1 text-4xl leading-loose">
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
  );

  // Follow-along: same script and size as renderFullAyah, split per word
  const renderSpoken = () => {
    const { tajweedWords, indopakWords } = buildAyahWordData(ayah);
    const base = arabicScript === 'indopak' && indopakWords ? 'arabic-text-indopak' : 'arabic-text';
    return (
      <div dir="rtl" className={cn(base, 'flex flex-wrap justify-center gap-x-2 text-4xl leading-loose')}>
        {actualWords.map((word, wi) => {
          const cls = cn('rounded-lg px-0.5 transition-colors duration-150', wi === spokenWord && 'bg-gold/25');
          if (arabicScript === 'tajweed' && tajweedWords) {
            return <span key={word.position} className={cn('tajweed-text', cls)} dangerouslySetInnerHTML={{ __html: tajweedWords[wi] }} />;
          }
          if (arabicScript === 'indopak' && indopakWords) return <span key={word.position} className={cls}>{indopakWords[wi]}</span>;
          return <span key={word.position} className={cls}>{word.textUthmani}</span>;
        })}
        {/* The verse-end numeral (tajweed text only) isn't a word, so the split drops it */}
        {arabicScript === 'tajweed' && tajweedWords && ayah.textUthmaniTajweed?.match(/<span class=end>[^<]*<\/span>/) && (
          <span className="tajweed-text" dangerouslySetInnerHTML={{ __html: ayah.textUthmaniTajweed.match(/<span class=end>[^<]*<\/span>/)![0] }} />
        )}
      </div>
    );
  };

  return (
    <div className={cn('space-y-3', dimmed && 'opacity-30', className)}>
      {spokenWord !== undefined ? renderSpoken() : hasWordInteraction ? renderWordByWord() : renderFullAyah()}

      {shouldShowTransliteration && (
        <p className="text-center text-sm text-muted">
          {ayah.transliteration || actualWords.map((w) => w.transliteration).filter(Boolean).join(' ')}
        </p>
      )}

      {shouldShowTranslation && ayah.translation && (
        <p className="text-center text-sm italic text-muted">
          {ayah.translation}
        </p>
      )}
    </div>
  );
}
