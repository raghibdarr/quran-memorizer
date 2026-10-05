'use client';

import { cn } from '@/lib/cn';

/**
 * The play and hide controls on an ayah card, the same on every screen. Labelled
 * pills with a visible fill, so they read as buttons on a phone (the bare 12-14px
 * icons they replace didn't), at a 36px height inside a 44px hit area.
 */

const pill = 'hit-44 pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors disabled:opacity-40';

export function PlayPill({ playing, onClick, disabled, label = 'Play' }: {
  playing?: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={playing ? 'Playing' : `${label} ayah`}
      className={cn(pill, 'bg-teal/10 text-teal hover:bg-teal/20')}
    >
      {playing ? (
        <span className="flex h-4 items-end gap-[2px]" aria-hidden>
          <span className="w-[3px] animate-[bar1_0.8s_ease-in-out_infinite] rounded-full bg-teal" />
          <span className="w-[3px] animate-[bar2_0.8s_ease-in-out_infinite_0.2s] rounded-full bg-teal" />
          <span className="w-[3px] animate-[bar3_0.8s_ease-in-out_infinite_0.4s] rounded-full bg-teal" />
        </span>
      ) : (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
      )}
      {playing ? 'Playing' : label}
    </button>
  );
}

export function HidePill({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hidden ? 'Show ayah text' : 'Hide ayah text'}
      aria-pressed={!hidden}
      className={cn(pill, 'bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/10')}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {hidden ? (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        ) : (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </>
        )}
      </svg>
      {hidden ? 'Show' : 'Hide'}
    </button>
  );
}
