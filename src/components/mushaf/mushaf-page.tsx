'use client';

import { memo } from 'react';
import { cn } from '@/lib/cn';
import { firstLetters } from '@/lib/first-letters';
import { MUSHAF_LINE_WIDTH, type LineSpec, type MushafPage as Page, type MushafWord } from '@/lib/mushaf';

export type WordMark = 'playing' | 'spoken' | 'hidden' | 'hint' | 'flag' | null;

interface Props {
  page: Page;
  /** Base font size in px; a line is MUSHAF_LINE_WIDTH em wide */
  fontSize: number;
  /** Per-word state (playing ayah, the recited word, hidden for recall…) */
  markWord?: (w: MushafWord) => WordMark;
  /** Background tint per ayah (reading highlights), as a class name */
  ayahTint?: (surah: number, ayah: number) => string | null;
  onAyahTap?: (surah: number, ayah: number, el: HTMLElement) => void;
  /** When set, a tap on a word goes here instead (recall mode: peek at it) */
  onWordTap?: (w: MushafWord) => void;
  /** The layout's font and line width (Madina by default) */
  font?: string;
  lineWidth?: number;
}

function lineStyle(spec: LineSpec): React.CSSProperties {
  const z = spec.z ?? 1;
  return {
    fontSize: `${z}em`,
    lineHeight: String(1.8 / z),
    width: `${spec.w / z}em`,
    margin: '0 auto',
    whiteSpace: 'nowrap',
    textAlign: spec.k === 'text' ? 'right' : 'center',
    transform: spec.x ? `scaleX(${spec.x})` : undefined,
    transformOrigin: 'top right',
  };
}

/**
 * One Madina mushaf page as live text (roadmap #06): the print's lines, each word
 * stretched by the DigitalKhatt font's justification features and spaced as in the
 * print. Words are real text: selectable, readable by screen readers.
 */
function MushafPageView({ page, fontSize, markWord, ayahTint, onAyahTap, onWordTap, font = 'QMH New Madina', lineWidth = MUSHAF_LINE_WIDTH }: Props) {
  return (
    <div
      dir="rtl"
      lang="ar"
      className="mushaf-page mx-auto select-text text-foreground"
      style={{ fontFamily: `"${font}", var(--font-arabic), serif`, fontSize, lineHeight: 1.8, width: `${lineWidth + 0.4}em` }}
      data-mushaf-page={page.page}
    >
      {page.lines.map((line, li) => {
        if (line.spec.k === 'sura') {
          const name = line.words.map((w) => w.text).join(' ');
          return (
            <div key={li} className="mushaf-sura-title relative flex items-center justify-center" style={{ height: '1.8em' }}>
              <span className="relative z-10 text-[0.8em] text-teal">{name}</span>
            </div>
          );
        }
        let n = 0;
        return (
          <div key={li} style={lineStyle(line.spec)} data-line={li + 1}>
            {line.words.map((w, wi) => {
              const gap = n > 0 && line.spec.k === 'text' ? line.spec.s?.[n - 1] ?? 0.25 : null;
              n++;
              const mark = markWord?.(w) ?? null;
              const tint = w.ayah !== null ? ayahTint?.(w.surah, w.ayah) : null;
              const condense = line.spec.c && w.kind !== 'marker' ? line.spec.c : null;
              return (
                <span key={wi}>
                  {gap !== null && (
                    <span
                      aria-hidden
                      style={gap >= 0 ? { display: 'inline-block', width: `${gap}em` } : { display: 'inline-block', width: 0, marginLeft: `${gap}em` }}
                    >{' '}</span>
                  )}
                  {gap === null && wi > 0 && ' '}
                  <span
                    data-ayah={w.ayah ? `${w.surah}:${w.ayah}` : undefined}
                    data-word={w.wordNo || undefined}
                    onClick={
                      onWordTap && w.kind === 'word' ? () => onWordTap(w)
                        : w.ayah !== null && onAyahTap ? (e) => onAyahTap(w.surah, w.ayah!, e.currentTarget)
                          : undefined
                    }
                    className={cn(
                      'mushaf-word rounded-[0.15em] transition-colors duration-150',
                      w.ayah !== null && onAyahTap && 'cursor-pointer',
                      w.kind === 'marker' && 'text-gold-deep',
                      tint,
                      mark === 'playing' && 'bg-teal/10',
                      mark === 'spoken' && 'bg-teal/25',
                      mark === 'flag' && 'bg-gold/25',
                      mark === 'hint' && 'relative text-transparent',
                      mark === 'hidden' && 'mushaf-word-hidden',
                    )}
                    style={{
                      fontFeatureSettings: w.features || undefined,
                      ...(condense ? { display: 'inline-block', transform: `scaleX(${condense})`, transformOrigin: wi === 0 ? 'right' : wi === line.words.length - 1 ? 'left' : 'center' } : null),
                    }}
                  >
                    {w.text}
                    {mark === 'hint' && (
                      // The first letters, over the word's own (invisible) ink, so the line keeps its width
                      <span aria-hidden className="absolute inset-y-0 right-0 text-foreground/55">{firstLetters(w.text.replace(/\u034F/g, ''))}</span>
                    )}
                  </span>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default memo(MushafPageView);
