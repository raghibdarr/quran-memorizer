'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { inferMark } from '@/lib/worship/log';
import { useWorshipStore } from '@/stores/worship-store';
import { TIME_LABELS, type PrayerName } from '@/types/prayer';
import { MARK_LABELS, TRACKER_COPY } from './copy';
import MarkSheet from './mark-sheet';
import { useNow } from './use-now';

const LONG_PRESS_MS = 450;
const MOVE_SLOP = 10;

export interface TrackerTickProps {
  iso: string;
  prayer: PrayerName;
  /** When the prayer's time begins and ends; null when unknown (no place set) */
  startMs: number | null;
  endMs: number | null;
}

/**
 * The tick on a prayer row (spec 2.7). Tap a passed prayer: prayed, on time if
 * its time hasn't ended yet, else late. Hold (or the context-menu key): On time
 * / Late / Missed / Clear. Tapping a marked prayer opens the same choices, so a
 * stray tap never wipes a mark. A prayer whose time hasn't begun is inert.
 * Without times every prayer can be ticked, and a tap counts as on time.
 */
export default function TrackerTick({ iso, prayer, startMs, endMs }: TrackerTickProps) {
  const now = useNow();
  const entry = useWorshipStore((s) => s.prayers[iso]?.[prayer]);
  const markPrayer = useWorshipStore((s) => s.markPrayer);
  const [menu, setMenu] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const longFired = useRef(false);

  const future = startMs !== null && now < startMs;
  const mark = entry?.s;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const cancelPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  const openMenu = () => {
    cancelPress();
    longFired.current = true;
    haptic.selection();
    setMenu(true);
  };

  const tap = () => {
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    if (future) return;
    if (mark) {
      setMenu(true);
      return;
    }
    const at = Date.now();
    const s = startMs === null ? 'ontime' : inferMark(at, startMs, endMs);
    if (!s) return;
    haptic.selection();
    markPrayer(iso, prayer, s, at);
  };

  const state = future ? TRACKER_COPY.notYet : mark ? MARK_LABELS[mark] : TRACKER_COPY.notMarked;

  return (
    <>
      <button
        type="button"
        disabled={future}
        aria-label={TRACKER_COPY.tickAria(TIME_LABELS[prayer], state)}
        aria-haspopup="dialog"
        data-tick={`${iso}:${prayer}`}
        data-mark={mark ?? 'none'}
        onClick={tap}
        onPointerDown={(e) => {
          if (future || e.button !== 0) return;
          longFired.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          timer.current = setTimeout(openMenu, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_SLOP) cancelPress();
        }}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(e) => {
          // A touch long-press raises the context menu too: it opens the choices once
          e.preventDefault();
          if (!future && !menu) openMenu();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            if (!future) openMenu();
          }
        }}
        className={cn(
          'flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full',
          'touch-manipulation [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]',
          future ? 'cursor-default' : 'pressable',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150 motion-reduce:transition-none',
            mark === 'ontime' && 'bg-teal text-on-teal',
            mark === 'late' && 'bg-gold text-on-gold',
            mark === 'missed' && 'border-[1.5px] border-muted/60',
            !mark && !future && 'border-[1.5px] border-foreground/30',
            !mark && future && 'border-[1.5px] border-dashed border-foreground/15',
          )}
        >
          {(mark === 'ontime' || mark === 'late') && <CheckIcon size={14} />}
          {mark === 'missed' && <span className="h-[1.5px] w-2.5 rounded-full bg-muted/70" />}
        </span>
      </button>
      <MarkSheet
        open={menu}
        onClose={() => {
          setMenu(false);
          longFired.current = false;
        }}
        iso={iso}
        prayer={prayer}
      />
    </>
  );
}
