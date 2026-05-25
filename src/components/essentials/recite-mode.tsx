'use client';

import { useEffect, useRef, useState } from 'react';
import type { EssentialItem, Ayah } from '@/types/quran';
import { audioController } from '@/lib/audio';
import { getSurah } from '@/lib/quran-data';
import { useSettingsStore } from '@/stores/settings-store';
import { useEssentialsStore } from '@/stores/essentials-store';
import ArabicText from '@/components/ui/arabic-text';
import { cn } from '@/lib/cn';

interface Props {
  items: EssentialItem[];
  onClose: () => void;
}

export default function ReciteMode({ items, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [quranAyah, setQuranAyah] = useState<Ayah | null>(null);
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  const arabicClass = arabicScript === 'indopak' ? 'arabic-text-indopak' : 'arabic-text';
  const memorized = useEssentialsStore((s) => s.memorized);
  const { toggleMemorized } = useEssentialsStore();
  const touchStartX = useRef(0);

  const item = items[index];
  const total = items.length;

  // Load Quranic ayah for tajweed/indopak rendering
  useEffect(() => {
    setQuranAyah(null);
    if (item?.surahId && item?.ayahNumber) {
      getSurah(item.surahId).then((surah) => {
        const ayah = surah.ayahs.find((a) => a.number === item.ayahNumber);
        if (ayah) setQuranAyah(ayah);
      });
    }
  }, [item?.surahId, item?.ayahNumber]);

  // Autoplay audio + advance when finished
  useEffect(() => {
    if (!autoplay || !item?.audioUrl) return;
    let cancelled = false;
    setIsPlaying(true);
    audioController.playAndWait(item.audioUrl).then(() => {
      if (cancelled) return;
      setIsPlaying(false);
      if (index < total - 1) setIndex((i) => i + 1);
      else setAutoplay(false);
    });
    return () => {
      cancelled = true;
      audioController.stop();
      setIsPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, index, item?.audioUrl]);

  // Stop audio on close / unmount
  useEffect(() => {
    return () => {
      audioController.stop();
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < total - 1) setIndex(index + 1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, total, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && index < total - 1) setIndex(index + 1);
      else if (diff < 0 && index > 0) setIndex(index - 1);
    }
  };

  const playOnce = async () => {
    if (!item?.audioUrl) return;
    setIsPlaying(true);
    await audioController.playAndWait(item.audioUrl);
    setIsPlaying(false);
  };

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-cream">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-foreground/5 px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          ✕ Close
        </button>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted">Recite mode</p>
          <p className="text-xs font-semibold text-foreground">{index + 1} / {total}</p>
        </div>
        <button
          onClick={() => toggleMemorized(item.id)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
            memorized[item.id] ? 'bg-success/15 text-success' : 'bg-foreground/5 text-muted hover:bg-foreground/10',
          )}
        >
          {memorized[item.id] ? '✓ Known' : 'Mark known'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-foreground/10">
        <div
          className="h-full bg-teal transition-all duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {/* Card content */}
      <div
        className="flex flex-1 flex-col overflow-y-auto px-6 py-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-teal">
            {item.category === 'dua' ? 'Dua' : item.category === 'dhikr' ? 'Dhikr' : 'Ayah'}
          </p>
          <h2 className="mt-2 text-center text-lg font-bold text-foreground">{item.title}</h2>
          {item.titleArabic && (
            <p className={`${arabicClass} mt-1 text-center text-base text-muted`}>{item.titleArabic}</p>
          )}
          <p className="mt-2 text-center text-xs text-muted">{item.description}</p>

          {/* Arabic */}
          <div className="mt-6 rounded-2xl bg-foreground/5 p-6 text-center">
            {quranAyah ? (
              <ArabicText ayah={quranAyah} className="text-3xl leading-loose" />
            ) : (
              <p className={`${arabicClass} text-3xl leading-loose`}>{item.arabic}</p>
            )}
          </div>

          {/* Transliteration */}
          <p className="mt-4 text-center text-sm text-muted" dir="ltr">{item.transliteration}</p>

          {/* Translation */}
          <p className="mt-2 text-center text-sm italic text-muted">{item.translation}</p>

          {/* Source */}
          {item.source && (
            <p className="mt-3 text-center text-[10px] text-muted/60">Source: {item.source}</p>
          )}

          {/* Repetition note */}
          {item.repetitions && (
            <p className="mt-3 text-center text-xs font-semibold text-gold">
              Recite {item.repetitions}x
            </p>
          )}
        </div>
      </div>

      {/* Footer controls */}
      <div className="border-t border-foreground/5 bg-cream px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            onClick={() => setIndex(Math.max(0, index - 1))}
            disabled={index === 0}
            className="flex-1 rounded-xl border border-foreground/10 py-2.5 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            ← Prev
          </button>

          {item.audioUrl && (
            <>
              <button
                onClick={playOnce}
                disabled={isPlaying && autoplay}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                  isPlaying ? 'bg-teal text-white' : 'bg-foreground/5 text-muted hover:bg-foreground/10',
                )}
                aria-label="Play"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
              </button>
              <button
                onClick={() => setAutoplay((v) => !v)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-2 text-[10px] font-semibold transition-colors',
                  autoplay ? 'bg-teal text-white' : 'bg-foreground/5 text-muted hover:bg-foreground/10',
                )}
                aria-label="Toggle autoplay"
              >
                {autoplay ? 'AUTO ON' : 'AUTO'}
              </button>
            </>
          )}

          <button
            onClick={() => (index < total - 1 ? setIndex(index + 1) : onClose())}
            className="flex-1 rounded-xl bg-teal py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            {index < total - 1 ? 'Next →' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
