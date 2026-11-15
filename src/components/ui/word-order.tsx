'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface OrderTile {
  id: string | number;
  /** Tiles with the same `match` are interchangeable (a word that comes twice) */
  match?: string;
}

interface WordOrderProps<T extends OrderTile> {
  /** The tiles in their right order */
  order: T[];
  /** The same tiles as offered, shuffled by the caller */
  tiles: T[];
  /** A tile once it is placed in the answer row */
  renderPlaced: (tile: T) => ReactNode;
  /** A tile in the bank (defaults to `renderPlaced`) */
  renderTile?: (tile: T) => ReactNode;
  /** Shown already in place, before the learner's own tiles (the opening of a long text) */
  lead?: ReactNode;
  /** The line above the answer row */
  prompt?: ReactNode;
  onSolved?: () => void;
  /** Shown under the tiles once every one is placed */
  children?: ReactNode;
  className?: string;
}

/**
 * Put the words in order (right to left): tap the tiles in sequence. A wrong
 * tap is refused and the tiles already placed stay, so one slip does not wipe
 * the row. Shared by the Quran lesson and the hadith and dua flow.
 */
export default function WordOrder<T extends OrderTile>({ order, tiles, renderPlaced, renderTile = renderPlaced, lead, prompt, onSolved, children, className }: WordOrderProps<T>) {
  const [placed, setPlaced] = useState<T[]>([]);
  const [wrong, setWrong] = useState(false);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (wrongTimer.current && clearTimeout(wrongTimer.current)), []);

  const solved = order.length > 0 && placed.length === order.length;

  const pick = (tile: T) => {
    if (solved || wrong) return;
    const want = order[placed.length];
    const fits = tile.id === want.id || (tile.match !== undefined && tile.match === want.match);
    if (!fits) {
      setWrong(true);
      wrongTimer.current = setTimeout(() => setWrong(false), 600);
      return;
    }
    const next = [...placed, tile];
    setPlaced(next);
    if (next.length === order.length) onSolved?.();
  };

  return (
    <div className={cn('space-y-5', className)} data-word-order data-solved={solved || undefined}>
      {prompt && <p className="text-center text-sm text-muted">{prompt}</p>}

      <div className="flex min-h-[56px] flex-wrap justify-center gap-2 rounded-xl border-2 border-dashed border-foreground/25 bg-card/50 p-3" dir="rtl" data-order-row>
        {lead}
        {placed.length === 0 && !lead && (
          <span dir="ltr" className="py-2 text-sm text-muted">
            Tap the words below in order
          </span>
        )}
        {placed.map((tile, i) => (
          <span
            key={i}
            className={cn(
              'arabic-text rounded-lg px-3 py-1.5 text-xl',
              wrong ? 'border border-miss/30 bg-miss/10 text-miss' : solved ? 'border border-success/30 bg-success/10 text-success' : 'border border-teal/30 bg-teal/10 text-teal',
            )}
          >
            {renderPlaced(tile)}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2" dir="rtl" data-order-tiles>
        {tiles.map((tile) => {
          const used = placed.some((p) => p.id === tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => pick(tile)}
              disabled={used || solved || wrong}
              data-order-tile={tile.id}
              className={cn('flex flex-col items-center rounded-xl px-4 py-2', used ? 'border-[1.5px] border-transparent bg-foreground/5 text-foreground/20' : 'tactile-chip bg-card hover:border-gold')}
            >
              {renderTile(tile)}
            </button>
          );
        })}
      </div>

      {solved && children}

      {/* Always a line tall, so a refused tap does not move what is under it */}
      {!(solved && children) && (
        <p className="min-h-5 text-center text-sm text-miss" role="status">
          {wrong ? 'Not quite. Try again.' : ''}
        </p>
      )}
    </div>
  );
}
