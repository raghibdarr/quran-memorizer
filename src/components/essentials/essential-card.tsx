'use client';

import { useState, useEffect } from 'react';
import { audioController } from '@/lib/audio';
import { useEssentialsStore } from '@/stores/essentials-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getSurah } from '@/lib/quran-data';
import ArabicText from '@/components/ui/arabic-text';
import Card from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { EssentialItem, Ayah } from '@/types/quran';

interface Props {
  item: EssentialItem;
}

export default function EssentialCard({ item }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [quranAyah, setQuranAyah] = useState<Ayah | null>(null);
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  const arabicClass = arabicScript === 'indopak' ? 'arabic-text-indopak' : 'arabic-text';
  const memorized = useEssentialsStore((s) => s.memorized[item.id]);
  const counter = useEssentialsStore((s) => s.counters[item.id] ?? 0);
  const { toggleMemorized, incrementCounter, resetCounter } = useEssentialsStore();

  // Load Quranic ayah data for tajweed/indopak rendering
  useEffect(() => {
    if (expanded && item.surahId && item.ayahNumber && !quranAyah) {
      getSurah(item.surahId).then((surah) => {
        const ayah = surah.ayahs.find((a) => a.number === item.ayahNumber);
        if (ayah) setQuranAyah(ayah);
      });
    }
  }, [expanded, item.surahId, item.ayahNumber, quranAyah]);

  const playAudio = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.audioUrl) return;
    setIsPlaying(true);
    await audioController.play(item.audioUrl);
    setIsPlaying(false);
  };

  const handleCounterTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.repetitions && counter >= item.repetitions) {
      resetCounter(item.id);
    } else {
      incrementCounter(item.id);
    }
  };

  return (
    <Card
      onClick={() => setExpanded(!expanded)}
      className={cn(
        'cursor-pointer',
        memorized && 'border border-success/20 bg-success/5'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
          {item.titleArabic && (
            <p className={`${arabicClass} mt-0.5 text-base`}>{item.titleArabic}</p>
          )}
          <p className="mt-0.5 text-xs text-muted">{item.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.audioUrl && (
            <button
              onClick={playAudio}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                isPlaying ? 'bg-teal text-white' : 'bg-foreground/5 text-muted hover:bg-foreground/10'
              )}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2l10 6-10 6V2z" />
              </svg>
            </button>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={cn('text-muted transition-transform', expanded && 'rotate-180')}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          {/* Arabic text — use ArabicText for Quranic ayahs (tajweed/indopak), plain text for hadith */}
          <div className="rounded-xl bg-foreground/5 p-4 text-center">
            {quranAyah ? (
              <ArabicText ayah={quranAyah} className="text-2xl leading-loose" />
            ) : (
              <p className={`${arabicClass} text-2xl leading-loose`}>{item.arabic}</p>
            )}
          </div>

          {/* Transliteration */}
          <p className="text-center text-sm text-muted" dir="ltr">{item.transliteration}</p>

          {/* Translation */}
          <p className="text-center text-sm italic text-muted">{item.translation}</p>

          {/* Source */}
          {item.source && (
            <p className="text-center text-[10px] text-muted/60">Source: {item.source}</p>
          )}

          {/* Tasbih counter */}
          {item.repetitions && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                onClick={handleCounterTap}
                className={cn(
                  'relative flex h-20 w-20 items-center justify-center rounded-full transition-all',
                  counter >= item.repetitions
                    ? 'bg-success text-white'
                    : 'bg-teal/10 text-teal active:scale-95'
                )}
              >
                <span className="text-2xl font-bold">{counter}</span>
              </button>
              <p className="text-xs text-muted">
                {counter >= item.repetitions ? 'Complete! Tap to reset' : `${counter} / ${item.repetitions}`}
              </p>
            </div>
          )}

          {/* Memorized toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleMemorized(item.id); }}
            className={cn(
              'w-full rounded-lg py-2 text-xs font-semibold transition-colors',
              memorized
                ? 'bg-success/10 text-success'
                : 'bg-foreground/5 text-muted hover:bg-foreground/10'
            )}
          >
            {memorized ? 'Memorized' : 'Mark as memorized'}
          </button>
        </div>
      )}
    </Card>
  );
}
