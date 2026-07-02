'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, type PanInfo, type Transition } from 'motion/react';
import type { Surah, Ayah, Word } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { useSettingsStore } from '@/stores/settings-store';
import { audioController } from '@/lib/audio';
import { segmentAyah, buildAyahWordData, type AyahSegment } from '@/lib/segments';
import ArabicText from '@/components/ui/arabic-text';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface UnderstandPhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonId: string;
  onComplete: () => void;
}

// Snappy, lightly bouncy spring for the deck shuffle.
const SPRING: Transition = { type: 'spring', duration: 0.7, bounce: 0.18 };

// Clean offset stack — every card is the SAME size (no scale-down); depth is just a small
// down-right step, like a real deck. offset is LINEAR (idx - current ayah): 0 = front,
// 1..3 = upcoming ayahs peeking below (capped at 3 via slotFor). Done ayahs (offset < 0)
// get tossed to DONE_SLOT; prev brings one back from there.
const STACK_SLOTS = [
  { x: 0,  y: 0,  rotateZ: 0, scale: 1, opacity: 1 },
  { x: 7,  y: 11, rotateZ: 0, scale: 1, opacity: 1 },
  { x: 14, y: 22, rotateZ: 0, scale: 1, opacity: 1 },
  { x: 20, y: 32, rotateZ: 0, scale: 1, opacity: 1 },
];
const DONE_SLOT = { x: -240, y: -16, rotateZ: -9, scale: 1, opacity: 0 };
const MAX_BELOW = STACK_SLOTS.length - 1; // most cards shown behind the front
// Cards stay OPAQUE; a light opaque scrim grows with depth so deeper cards read as dimmer.
const SCRIM_ALPHA = [0, 0.04, 0.08, 0.12];
function slotFor(offset: number) {
  return STACK_SLOTS[Math.min(offset, STACK_SLOTS.length - 1)];
}

// quran.com's word audio_url numbers files by word POSITION (it counts pause marks as
// their own slots), but the CDN actually stores word audio CONSECUTIVELY — one file per
// real word, 1..N. So for any ayah with an internal pause mark the stored URL points one
// (or more) files too far, playing the NEXT word (and the tail 404s). Renumber by the
// word's consecutive index among real words to hit the correct file.
function wordAudioUrl(word: Word, index: number): string | null {
  if (!word.audioUrl) return null;
  return word.audioUrl.replace(/_\d+\.mp3$/, `_${String(index + 1).padStart(3, '0')}.mp3`);
}

export default function UnderstandPhase({ surah, ayahs, lessonId, onComplete }: UnderstandPhaseProps) {
  const lesson = useProgressStore((s) => s.lessons[lessonId]);
  const savedExplored = lesson?.phaseData.understand.exploredAyahs;
  const transliterationEnabled = useSettingsStore((s) => s.transliterationEnabled);
  const translationEnabled = useSettingsStore((s) => s.translationEnabled);
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  // Deck items: one per waqf segment — short ayahs (the common case) are exactly one item
  const deckItems = useMemo(
    () => ayahs.flatMap((ayah, ayahIdx) => segmentAyah(ayah).map((seg) => ({ ayah, ayahIdx, seg }))),
    [ayahs]
  );
  const [itemIndex, setItemIndex] = useState(0);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [revealedTranslations, setRevealedTranslations] = useState<Set<number>>(new Set());
  // Segment-level visits; an ayah counts as explored once ALL its segments were seen.
  const [visitedItems, setVisitedItems] = useState<Set<number>>(() => {
    const v = new Set<number>([0]);
    if (savedExplored) {
      deckItems.forEach((it, i) => {
        if (savedExplored.includes(it.ayahIdx)) v.add(i);
      });
    }
    return v;
  });
  const exploredAyahs = useMemo(() => {
    const visitedPerAyah = new Map<number, number>();
    visitedItems.forEach((i) => {
      const it = deckItems[i];
      if (it) visitedPerAyah.set(it.ayahIdx, (visitedPerAyah.get(it.ayahIdx) ?? 0) + 1);
    });
    const explored = new Set<number>();
    deckItems.forEach((it) => {
      if ((visitedPerAyah.get(it.ayahIdx) ?? 0) >= it.seg.count) explored.add(it.ayahIdx);
    });
    return explored;
  }, [visitedItems, deckItems]);
  const { markUnderstandComplete, updateExploredAyahs } = useProgressStore();

  // Persist explored ayahs
  useEffect(() => {
    updateExploredAyahs(lessonId, [...exploredAyahs]);
  }, [exploredAyahs, lessonId, updateExploredAyahs]);

  const currentItem = deckItems[itemIndex];
  const currentAyah = currentItem.ayah;
  const allExplored = exploredAyahs.size >= ayahs.length;

  // Per-word Arabic in the user's chosen script for every ayah (word data is plain
  // Uthmani only; tajweed/indopak derive from the ayah-level fields with count-checked
  // fallbacks). Memoized once — segment faces, stacked cards, and chips all draw on it.
  const ayahData = useMemo(() => ayahs.map((a) => buildAyahWordData(a)), [ayahs]);
  const { words: actualWords, tajweedWords, indopakWords } = ayahData[currentItem.ayahIdx];
  const renderWordArabic = (wi: number, fallback: string, sizeClass: string) => {
    if (arabicScript === 'tajweed' && tajweedWords && wi >= 0) {
      return (
        <span
          className={cn('arabic-text tajweed-text', sizeClass)}
          dangerouslySetInnerHTML={{ __html: tajweedWords[wi] }}
        />
      );
    }
    if (arabicScript === 'indopak' && indopakWords && wi >= 0) {
      return <span className={cn('arabic-text-indopak', sizeClass)}>{indopakWords[wi]}</span>;
    }
    return <span className={cn('arabic-text', sizeClass)}>{fallback}</span>;
  };

  const handleWordClick = async (word: Word, index: number) => {
    setSelectedWord(word);
    const url = wordAudioUrl(word, index);
    if (url) {
      await audioController.play(url);
    }
  };

  const goTo = (index: number) => {
    setItemIndex(index);
    setSelectedWord(null);
    setVisitedItems((prev) => new Set([...prev, index]));
  };
  const goNext = () => { if (itemIndex < deckItems.length - 1) goTo(itemIndex + 1); };
  const goPrev = () => { if (itemIndex > 0) goTo(itemIndex - 1); };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const power = info.offset.x + info.velocity.x * 0.2;
    if (power < -70) goNext();
    else if (power > 70) goPrev();
    // otherwise elastic constraints spring it back to center
  };

  const handleContinue = () => {
    markUnderstandComplete(lessonId);
    onComplete();
  };

  // Card face — reused by the invisible height sizer and every deck card.
  // An item is one waqf segment; short ayahs have exactly one whole-ayah item.
  const renderFace = (item: { ayah: Ayah; ayahIdx: number; seg: AyahSegment }) => {
    const { ayah, ayahIdx, seg } = item;
    const isWhole = seg.count === 1;
    const data = ayahData[ayahIdx];
    const segWords = data.words.slice(seg.wordStart, seg.wordEnd + 1);
    const segTranslit = segWords.map((w) => w.transliteration).filter(Boolean).join(' ');
    return (
      <>
        <div className="mx-auto mb-4 flex w-fit items-center gap-2.5" aria-hidden>
          <span className="h-px w-8 bg-gold/50" />
          <span className="h-1.5 w-1.5 rotate-45 bg-gold" />
          <span className="h-px w-8 bg-gold/50" />
        </div>
        {isWhole ? (
          <ArabicText ayah={ayah} className="text-3xl leading-loose" />
        ) : arabicScript === 'tajweed' && data.tajweedWords ? (
          <div
            className="arabic-text tajweed-text text-3xl leading-loose"
            dangerouslySetInnerHTML={{
              // The boundary word's tajweed token already carries its pause mark
              // (ZWNJ-glued in the source HTML) — only append when it doesn't.
              __html:
                data.tajweedWords.slice(seg.wordStart, seg.wordEnd + 1).join(' ') +
                (seg.endMark &&
                !data.tajweedWords[seg.wordEnd].replace(/<[^>]+>/g, '').includes(seg.endMark)
                  ? ` ${seg.endMark}`
                  : ''),
            }}
          />
        ) : arabicScript === 'indopak' && data.indopakWords ? (
          <p className="arabic-text-indopak text-3xl leading-loose">
            {data.indopakWords.slice(seg.wordStart, seg.wordEnd + 1).join(' ')}
          </p>
        ) : (
          <p className="arabic-text text-3xl leading-loose">
            {segWords.map((w) => w.textUthmani).join(' ')}
          </p>
        )}
        {transliterationEnabled && (isWhole ? ayah.transliteration : segTranslit) && (
          <p className="mt-2 text-center text-sm text-muted">
            {isWhole ? ayah.transliteration : segTranslit}
          </p>
        )}
        {ayah.translation && (
          translationEnabled ? (
            <p className="mt-1 text-center text-sm italic text-muted">
              {ayah.translation}
              {!isWhole && <span className="text-xs not-italic text-muted/70"> (full ayah)</span>}
            </p>
          ) : revealedTranslations.has(ayahIdx) ? (
            <button
              onPointerDownCapture={(e) => e.stopPropagation()}
              onClick={() =>
                setRevealedTranslations((prev) => {
                  const next = new Set(prev);
                  next.delete(ayahIdx);
                  return next;
                })
              }
              className="group mt-1 flex flex-col items-center gap-0.5"
            >
              <span className="text-center text-sm italic text-muted">
                {ayah.translation}
                {!isWhole && <span className="text-xs not-italic text-muted/70"> (full ayah)</span>}
              </span>
              <span className="text-[10px] font-medium text-muted/50 transition-colors group-hover:text-muted">
                Tap to hide
              </span>
            </button>
          ) : (
            <button
              onPointerDownCapture={(e) => e.stopPropagation()}
              onClick={() => setRevealedTranslations((prev) => new Set([...prev, ayahIdx]))}
              className="mt-2 text-xs font-medium text-teal transition-colors hover:text-teal-light"
            >
              Tap to see translation
            </button>
          )
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Understand</h3>
        <p className="mt-1 text-sm text-muted">
          Explore each word to understand what you&apos;re memorizing.
        </p>
      </div>

      {/* Ayah navigation — Prev / counter / Next on a single row to save vertical space */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => goPrev()}
          disabled={itemIndex === 0}
          className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Prev
        </button>

        <span className="ink-border tactile-raise-sm inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.604 7.197l7.138 -3.109a.96 .96 0 0 1 1.27 .527l4.924 11.902a1.014 1.014 0 0 1 -.514 1.31l-7.137 3.109a.96 .96 0 0 1 -1.271 -.527l-4.924 -11.902a1.014 1.014 0 0 1 .514 -1.31z" />
            <path d="M15 4h1a1 1 0 0 1 1 1v3.5" />
            <path d="M20 6c.264 .112 .52 .217 .768 .315a1 1 0 0 1 .53 1.311l-2.298 5.374" />
          </svg>
          {currentItem.seg.count > 1
            ? `Ayah ${currentItem.ayahIdx + 1} of ${ayahs.length} · part ${currentItem.seg.index + 1}/${currentItem.seg.count}`
            : `Ayah ${currentItem.ayahIdx + 1} of ${ayahs.length}`}
        </span>

        <button
          onClick={() => goNext()}
          disabled={itemIndex === deckItems.length - 1}
          className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-teal transition-colors hover:text-teal-light disabled:opacity-0"
        >
          Next
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* === Card stack — clean offset deck; pb gives the peeking cards room above the words === */}
      <div className="pb-10">
        <div className="relative" style={{ perspective: '1300px', transformStyle: 'preserve-3d' }}>
          {/* Invisible sizer: gives the stack its height (cards are absolute, inset-0 = this size) */}
          <div className="invisible rounded-2xl p-6 text-center" aria-hidden>
            {renderFace(currentItem)}
          </div>

          {deckItems.map((item, idx) => {
            // Linear depth: 0 = front, 1..3 = upcoming cards peeking below; < 0 = done (tossed off).
            const offset = idx - itemIndex;
            const isFront = offset === 0;
            const isDone = offset < 0;
            const belowCount = Math.min(MAX_BELOW, deckItems.length - 1 - itemIndex);
            const isDeepest = offset === belowCount; // only this card carries the grounding shadow
            const scrimIdx = Math.max(0, Math.min(offset, SCRIM_ALPHA.length - 1));
            return (
              <motion.div
                key={`${item.ayah.key}#${item.seg.index}`}
                className="tactile-card card-deck-item absolute inset-0 select-none overflow-hidden rounded-2xl bg-card p-6 text-center"
                style={{
                  touchAction: 'pan-y',
                  cursor: isFront ? 'grab' : 'default',
                  pointerEvents: isFront ? 'auto' : 'none',
                  zIndex: isDone ? 50 : deckItems.length - offset,
                  boxShadow: isDeepest ? '4px 4px 0 var(--shadow-card-color)' : 'none',
                }}
                initial={false}
                animate={isDone ? DONE_SLOT : slotFor(offset)}
                transition={SPRING}
                drag={isFront ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5}
                onDragEnd={isFront ? handleDragEnd : undefined}
                whileDrag={{ cursor: 'grabbing' }}
              >
                {/* Light opaque depth scrim on the cards behind */}
                {offset > 0 && (
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{ background: 'var(--scrim-tint)', zIndex: 5 }}
                    initial={false}
                    animate={{ opacity: SCRIM_ALPHA[scrimIdx] }}
                    transition={SPRING}
                  />
                )}
                <div className="relative z-10">{renderFace(item)}</div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Word-by-word breakdown — scoped to the current segment */}
      <div key={itemIndex} className="animate-[card-rise_320ms_ease-out]">
        <div className="flex flex-wrap justify-center gap-2" dir="rtl">
          {actualWords.slice(currentItem.seg.wordStart, currentItem.seg.wordEnd + 1).map((word, i) => {
            const wi = currentItem.seg.wordStart + i; // absolute index in the ayah (audio + tajweed)
            const isSelected = selectedWord?.position === word.position;
            return (
              <button
                key={`${currentAyah.key}-${word.position}`}
                onClick={() => handleWordClick(word, wi)}
                className={cn(
                  'tactile-chip flex items-center justify-center rounded-xl px-4 py-2.5',
                  isSelected
                    ? 'border-gold bg-gold/10'
                    : 'bg-card hover:border-gold/60'
                )}
              >
                {renderWordArabic(wi, word.textUthmani, 'text-2xl leading-normal')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected word meaning — always rendered with reserved height so the grid above
          never reflows on tap and the meaning keeps one stable home (no pop-in shift) */}
      <div className="tactile-raise-sm flex min-h-[7.5rem] flex-col items-center justify-center rounded-2xl border-[1.5px] border-teal/50 bg-teal/5 p-4 text-center">
        {selectedWord ? (
          <div key={selectedWord.position} className="animate-[phase-in_240ms_ease-out]">
            {renderWordArabic(
              actualWords.findIndex((w) => w.position === selectedWord.position),
              selectedWord.textUthmani,
              'text-3xl'
            )}
            {transliterationEnabled && selectedWord.transliteration && (
              <p className="mt-1 text-sm text-muted" dir="ltr">{selectedWord.transliteration}</p>
            )}
            {selectedWord.translation && (
              <p className="mt-1 text-sm font-semibold text-teal" dir="ltr">{selectedWord.translation}</p>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            Tap any word above to hear it and read its meaning
          </p>
        )}
      </div>

      <Button
        onClick={handleContinue}
        disabled={!allExplored}
        className="w-full"
      >
        {allExplored
          ? 'Continue to Build'
          : `Explore all ayahs (${exploredAyahs.size}/${ayahs.length})`}
      </Button>

      {!allExplored && (
        <button
          onClick={handleContinue}
          className="mx-auto block text-xs text-muted transition-colors hover:text-foreground"
        >
          Already know the meanings? Skip to Build →
        </button>
      )}
    </div>
  );
}
