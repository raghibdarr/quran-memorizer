'use client';

import { cn } from '@/lib/cn';

export type Rating = 'got-it' | 'hesitated' | 'missed';

const RATINGS: Rating[] = ['got-it', 'hesitated', 'missed'];

const SELECTED: Record<Rating, string> = {
  'got-it': 'bg-success text-on-success ink-border',
  'hesitated': 'bg-gold text-on-gold ink-border',
  'missed': 'bg-miss text-on-miss ink-border',
};

const UNSELECTED: Record<Rating, string> = {
  'got-it': 'bg-success/10 text-success border-[1.5px] border-success/30 hover:bg-success/20',
  'hesitated': 'bg-gold/10 text-gold-deep border-[1.5px] border-gold/30 hover:bg-gold/20',
  'missed': 'bg-miss/10 text-miss border-[1.5px] border-miss/30 hover:bg-miss/20',
};

const DEFAULT_LABELS: Record<Rating, string> = {
  'got-it': 'Got it',
  'hesitated': 'Hesitated',
  'missed': 'Missed',
};

interface RatingButtonsProps {
  /** Currently selected rating, if any. */
  value?: Rating | null;
  onRate: (rating: Rating) => void;
  labels?: Partial<Record<Rating, string>>;
  size?: 'sm' | 'md';
  className?: string;
}

/** Shared Got it / Hesitated / Missed chips — tactile print treatment. */
export default function RatingButtons({ value, onRate, labels, size = 'md', className }: RatingButtonsProps) {
  return (
    <div className={cn('flex gap-2', className)}>
      {RATINGS.map((rating) => {
        const isSelected = value === rating;
        return (
          <button
            key={rating}
            onClick={() => onRate(rating)}
            className={cn(
              'flex-1 rounded-xl font-bold pressable transition-colors',
              size === 'md' ? 'py-2.5 text-sm' : 'py-2 text-xs',
              isSelected ? SELECTED[rating] : UNSELECTED[rating],
              isSelected && 'shadow-[2px_2px_0_var(--shadow-chip-color)]'
            )}
          >
            {labels?.[rating] ?? DEFAULT_LABELS[rating]}
          </button>
        );
      })}
    </div>
  );
}
