'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, type PanInfo, type Transition } from 'motion/react';
import type { Surah, Ayah, Word } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { audioController } from '@/lib/audio';
import ArabicText from '@/components/ui/arabic-text';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface UnderstandPhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonId: string;
  onComplete: () => void;
}

// Slow, slightly bouncy spring so the carousel rotation is legible and physical
const SPRING: Transition = { type: 'spring', duration: 0.85, bounce: 0.16 };
// Button presses get an eased 3-keyframe path so the card visibly arcs around
// (a drag carries the card on its own throw; a button has no throw to inherit).
const ARC_TRANSITION: Transition = { duration: 0.92, ease: 'easeInOut', times: [0, 0.5, 1] };

// Cycling-carousel slots. Parent is preserve-3d, so these translateZ depths are real
// (lower z genuinely renders behind). offset is cyclic: 0 = top/front (active), growing
// DOWN the deck — the largest offset is the bottom card (the PREVIOUS ayah), which sweeps
// up to the top on "prev". Kept shallow so the fan doesn't reach the words below.
const STACK_SLOTS = [
  { x: 0,  y: 0,  z: 0,    rotateZ: 0,   scale: 1,    opacity: 1 },
  { x: 11, y: 11, z: -52,  rotateZ: 2.5, scale: 0.95, opacity: 0.95 },
  { x: 19, y: 20, z: -100, rotateZ: 4.5, scale: 0.91, opacity: 0.82 },
  { x: 25, y: 27, z: -144, rotateZ: 6,   scale: 0.88, opacity: 0.66 },
  { x: 30, y: 33, z: -184, rotateZ: 7.5, scale: 0.85, opacity: 0.52 },
  { x: 33, y: 37, z: -218, rotateZ: 9,   scale: 0.83, opacity: 0.4 },
];
function slotFor(offset: number) {
  return STACK_SLOTS[Math.min(offset, STACK_SLOTS.length - 1)];
}

// Mid-arc waypoints the moving card passes through.
//   next → flung LEFT (like a drag-left throw) before the carousel sweeps it to the back
//   prev → lifted UP and toward the viewer, rising from the back to the top
const ARC_WP_NEXT = { x: -110, y: -6, z: 25, rotateZ: -12, scale: 1.02, opacity: 1 };
const ARC_WP_PREV = { x: -6, y: -40, z: 70, rotateZ: -5, scale: 1.05, opacity: 1 };
type Slot = typeof STACK_SLOTS[number];
function arcKeyframes(from: Slot, to: Slot, wp: typeof ARC_WP_NEXT) {
  return {
    x: [from.x, wp.x, to.x],
    y: [from.y, wp.y, to.y],
    z: [from.z, wp.z, to.z],
    rotateZ: [from.rotateZ, wp.rotateZ, to.rotateZ],
    scale: [from.scale, wp.scale, to.scale],
    opacity: [from.opacity, wp.opacity, to.opacity],
  };
}

export default function UnderstandPhase({ surah, ayahs, lessonId, onComplete }: UnderstandPhaseProps) {
  const lesson = useProgressStore((s) => s.lessons[lessonId]);
  const savedExplored = lesson?.phaseData.understand.exploredAyahs;
  const [ayahIndex, setAyahIndex] = useState(0);
  const [nav, setNav] = useState<{ dir: 'next' | 'prev'; viaButton: boolean }>({ dir: 'next', viaButton: false });
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [revealedTranslations, setRevealedTranslations] = useState<Set<number>>(new Set());
  const [exploredAyahs, setExploredAyahs] = useState<Set<number>>(
    savedExplored ? new Set(savedExplored) : new Set([0])
  );
  const { markUnderstandComplete, updateExploredAyahs } = useProgressStore();

  // Persist explored ayahs
  useEffect(() => {
    updateExploredAyahs(lessonId, [...exploredAyahs]);
  }, [exploredAyahs, lessonId, updateExploredAyahs]);

  const currentAyah = ayahs[ayahIndex];
  const allExplored = exploredAyahs.size >= ayahs.length;

  // Stable arc paths (front→back for next, back→front for prev) so unrelated re-renders
  // don't restart a mid-flight button arc.
  const nextArc = useMemo(() => arcKeyframes(STACK_SLOTS[0], slotFor(ayahs.length - 1), ARC_WP_NEXT), [ayahs.length]);
  const prevArc = useMemo(() => arcKeyframes(slotFor(ayahs.length - 1), STACK_SLOTS[0], ARC_WP_PREV), [ayahs.length]);

  const handleWordClick = async (word: Word) => {
    setSelectedWord(word);
    if (word.audioUrl) {
      await audioController.play(word.audioUrl);
    }
  };

  const goTo = (index: number, dir: 'next' | 'prev', viaButton: boolean) => {
    setNav({ dir, viaButton });
    setAyahIndex(index);
    setSelectedWord(null);
    setExploredAyahs((prev) => new Set([...prev, index]));
  };
  const goNext = (viaButton = false) => { if (ayahIndex < ayahs.length - 1) goTo(ayahIndex + 1, 'next', viaButton); };
  const goPrev = (viaButton = false) => { if (ayahIndex > 0) goTo(ayahIndex - 1, 'prev', viaButton); };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const power = info.offset.x + info.velocity.x * 0.2;
    if (power < -70) goNext(false);
    else if (power > 70) goPrev(false);
    // otherwise elastic constraints spring it back to center
  };

  const handleContinue = () => {
    markUnderstandComplete(lessonId);
    onComplete();
  };

  // Card face — reused by the invisible height sizer and every stacked card
  const renderFace = (ayah: Ayah, idx: number) => (
    <>
      <div className="mx-auto mb-4 flex w-fit items-center gap-2.5" aria-hidden>
        <span className="h-px w-8 bg-gold/50" />
        <span className="h-1.5 w-1.5 rotate-45 bg-gold" />
        <span className="h-px w-8 bg-gold/50" />
      </div>
      <ArabicText ayah={ayah} className="text-3xl leading-loose" />
      {ayah.transliteration && (
        <p className="mt-2 text-center text-sm text-muted">{ayah.transliteration}</p>
      )}
      {ayah.translation && (
        revealedTranslations.has(idx) ? (
          <p className="mt-1 text-center text-sm italic text-muted">{ayah.translation}</p>
        ) : (
          <button
            onPointerDownCapture={(e) => e.stopPropagation()}
            onClick={() => setRevealedTranslations((prev) => new Set([...prev, idx]))}
            className="mt-2 text-xs font-medium text-teal transition-colors hover:text-teal-light"
          >
            Tap to see translation
          </button>
        )
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Understand</h3>
        <p className="mt-1 text-sm text-muted">
          Explore each word to understand what you&apos;re memorizing.
        </p>
      </div>

      {/* Ayah navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => goPrev(true)}
          disabled={ayahIndex === 0}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Prev
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {ayahs.map((_, i) => (
            <div
              key={i}
              className={cn(
                'rounded-full transition-all',
                i === ayahIndex ? 'h-3 w-3 bg-teal' :
                exploredAyahs.has(i) ? 'h-2.5 w-2.5 bg-gold' :
                'h-2.5 w-2.5 border-[1.5px] border-foreground/25'
              )}
            />
          ))}
        </div>

        <button
          onClick={() => goNext(true)}
          disabled={ayahIndex === ayahs.length - 1}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-teal transition-colors hover:text-teal-light disabled:opacity-0"
        >
          Next
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      <div className="flex justify-center">
        <span className="ink-border tactile-raise-sm inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.604 7.197l7.138 -3.109a.96 .96 0 0 1 1.27 .527l4.924 11.902a1.014 1.014 0 0 1 -.514 1.31l-7.137 3.109a.96 .96 0 0 1 -1.271 -.527l-4.924 -11.902a1.014 1.014 0 0 1 .514 -1.31z" />
            <path d="M15 4h1a1 1 0 0 1 1 1v3.5" />
            <path d="M20 6c.264 .112 .52 .217 .768 .315a1 1 0 0 1 .53 1.311l-2.298 5.374" />
          </svg>
          Ayah {ayahIndex + 1} of {ayahs.length}
        </span>
      </div>

      {/* === 3D shuffling card stack (pb gives the fanned deck room above the words) === */}
      <div className="pb-8">
        <div className="relative" style={{ perspective: '1300px', transformStyle: 'preserve-3d' }}>
          {/* Invisible sizer: gives the stack its height (cards are absolute) */}
          <div className="invisible rounded-2xl p-6 text-center" aria-hidden>
            {renderFace(currentAyah, ayahIndex)}
          </div>

          {ayahs.map((ayah, idx) => {
            // Cyclic offset: 0 = front, growing downward; the largest = bottom = previous ayah
            const offset = (idx - ayahIndex + ayahs.length) % ayahs.length;
            const isFront = offset === 0;
            // The one card making the big front↔back move gets the throw-arc on a button press
            const isBigMover = nav.viaButton && (
              (nav.dir === 'next' && offset === ayahs.length - 1) ||
              (nav.dir === 'prev' && offset === 0)
            );
            return (
              <motion.div
                key={idx}
                className="tactile-card absolute inset-0 select-none overflow-hidden rounded-2xl bg-card p-6 text-center"
                style={{
                  touchAction: 'pan-y',
                  cursor: isFront ? 'grab' : 'default',
                  pointerEvents: isFront ? 'auto' : 'none',
                  zIndex: ayahs.length - offset,
                }}
                initial={false}
                animate={isBigMover ? (nav.dir === 'next' ? nextArc : prevArc) : slotFor(offset)}
                transition={isBigMover ? ARC_TRANSITION : SPRING}
                drag={isFront ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5}
                onDragEnd={isFront ? handleDragEnd : undefined}
                whileDrag={{ cursor: 'grabbing' }}
              >
                {renderFace(ayah, idx)}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Word-by-word breakdown */}
      <div key={ayahIndex} className="animate-[card-rise_320ms_ease-out]">
        <p className="mb-2 text-center text-xs text-muted">
          Tap a word to hear it and see its meaning
        </p>
        <div className="flex flex-wrap justify-center gap-2" dir="rtl">
          {currentAyah.words
            .filter((w) => w.charType === 'word')
            .map((word) => {
              const isSelected = selectedWord?.position === word.position;
              return (
                <button
                  key={`${currentAyah.key}-${word.position}`}
                  onClick={() => handleWordClick(word)}
                  className={cn(
                    'pressable tactile-raise-sm flex flex-col items-center rounded-xl border-[1.5px] px-3 py-2.5 transition-all',
                    isSelected
                      ? 'border-gold bg-gold/10'
                      : 'border-ink bg-card hover:border-gold/60'
                  )}
                >
                  <span className="arabic-text text-xl leading-normal">{word.textUthmani}</span>
                  {word.transliteration && (
                    <span className="mt-0.5 text-[10px] text-muted" dir="ltr">
                      {word.transliteration}
                    </span>
                  )}
                  {isSelected && word.translation && (
                    <span className="mt-1 text-xs font-semibold text-teal" dir="ltr">
                      {word.translation}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      {/* Selected word detail */}
      {selectedWord && (
        <div className="tactile-raise-sm rounded-2xl border-[1.5px] border-teal/50 bg-teal/5 p-4 text-center">
          <p className="arabic-text text-3xl">{selectedWord.textUthmani}</p>
          {selectedWord.transliteration && (
            <p className="mt-1 text-sm text-muted">{selectedWord.transliteration}</p>
          )}
          {selectedWord.translation && (
            <p className="mt-1 text-sm font-semibold text-teal">{selectedWord.translation}</p>
          )}
        </div>
      )}

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
