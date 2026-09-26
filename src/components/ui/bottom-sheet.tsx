'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';

// Motion (M11 spec §3): entrances settle with --spring-settle. A tap/Esc close
// starts gently and eases out (a curve that leaves at full speed covers ~75px
// in its first frame and reads as a jump, not a slide); a flicked sheet leaves
// at the speed it was thrown.
const ENTER = { duration: 460, easing: 'cubic-bezier(.22,1.2,.36,1)' };
const EXIT_DURATION = 400;
const EXIT_EASING = 'cubic-bezier(.4,0,.2,1)';
const FLICK_EXIT_EASING = 'cubic-bezier(.2,.6,.35,1)';
const SNAP_BACK = { duration: 360, easing: 'cubic-bezier(.34,1.3,.64,1)' };
const DISMISS_FRACTION = 0.3; // dragged past this share of the sheet's height…
const DISMISS_DISTANCE_MAX = 160; // …capped for tall sheets
const DISMISS_VELOCITY = 0.5; // …or flicked faster than this (px/ms)
const DRAG_SLOP = 6; // px before a touch counts as a drag rather than a tap/scroll

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Visually hidden title for sheets whose content carries its own heading */
  titleHidden?: boolean;
  /** Celebrations/acknowledgements can require their button; default: drag, scrim and Esc close */
  dismissible?: boolean;
  /** A labelled "Done" beside the title — for panels with no button of their own (settings, account) */
  doneButton?: boolean;
  className?: string;
  children: React.ReactNode;
}

type Drag = {
  startY: number;
  fromHandle: boolean;
  active: boolean;
  dy: number;
  pastThreshold: boolean;
  // Last two samples, for the release velocity (an average over the whole drag
  // would under-read a slow drag that ends in a flick)
  prevY: number;
  prevT: number;
  lastY: number;
  lastT: number;
};

/**
 * THE modal surface (M11c): every panel, picker, confirm and celebration is a
 * sheet rising from the bottom — grab handle, spring entrance, drag-to-dismiss
 * (the scrim fades with the drag), scrim tap, Esc; body scroll locked, focus
 * moved in and restored. Stays mounted through its exit animation, so callers
 * just flip `open`.
 *
 * Touch drags use touch events, not pointer events: the sheet scrolls, and a
 * scrollable element's browser pan cancels pointer streams on the first move —
 * only a non-passive touchmove can claim the gesture from the scroller.
 */
export default function BottomSheet({ open, onClose, title, titleHidden, dismissible = true, doneButton, className, children }: BottomSheetProps) {
  const [rendered, setRendered] = useState(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const drag = useRef<Drag | null>(null);
  const releaseVelocity = useRef(0);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Mount on open; on close, run the exit animation BEFORE unmounting
  if (open && !rendered) setRendered(true);

  useEffect(() => {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (!rendered || !sheet || !scrim) return;
    if (open) {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      sheet.focus({ preventScroll: true });
      if (!reducedMotion()) {
        sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], ENTER);
        scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      }
      return;
    }
    const finish = () => {
      setRendered(false);
      restoreFocus.current?.focus?.({ preventScroll: true });
    };
    if (reducedMotion()) return finish();

    // Leave from wherever the sheet is (mid-drag included); a flick keeps its speed
    const height = sheet.offsetHeight;
    const offset = Number(sheet.style.transform.match(/-?[\d.]+/)?.[0] ?? 0);
    const remaining = Math.max(0, height - offset);
    const v = releaseVelocity.current;
    releaseVelocity.current = 0;
    const flicked = v > 0.3;
    const duration = flicked ? Math.min(EXIT_DURATION, Math.max(200, (remaining / v) * 1.5)) : EXIT_DURATION;
    const easing = flicked ? FLICK_EXIT_EASING : EXIT_EASING;
    const scrimFrom = Number(scrim.style.opacity || 1);

    scrim.animate([{ opacity: scrimFrom }, { opacity: 0 }], { duration, easing, fill: 'forwards' });
    sheet
      .animate([{ transform: `translateY(${offset}px)` }, { transform: 'translateY(100%)' }], { duration, easing, fill: 'forwards' })
      .finished.then(finish);
  }, [open, rendered]);

  // Body scroll lock + Esc while shown
  useEffect(() => {
    if (!rendered) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [rendered, dismissible]);

  // Drag-to-dismiss — from the handle anywhere, or from the content when it's
  // scrolled to the top and the finger moves DOWN (moving up scrolls as usual)
  const beginDrag = (y: number, target: EventTarget | null) => {
    const sheet = sheetRef.current;
    if (!dismissible || !sheet) return;
    const fromHandle = !!(target as HTMLElement | null)?.closest?.('[data-sheet-handle]');
    if (!fromHandle && sheet.scrollTop > 0) return;
    const t = performance.now();
    drag.current = { startY: y, fromHandle, active: false, dy: 0, pastThreshold: false, prevY: y, prevT: t, lastY: y, lastT: t };
  };

  /** Returns true while the drag owns the gesture (the caller then blocks scrolling) */
  const moveDrag = (y: number): boolean => {
    const d = drag.current;
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (!d || !sheet || !scrim) return false;
    const raw = y - d.startY;
    if (!d.active) {
      if (Math.abs(raw) < DRAG_SLOP) return false;
      if (!d.fromHandle && (raw < 0 || sheet.scrollTop > 0)) {
        drag.current = null; // an upward swipe on content is a scroll
        return false;
      }
      d.active = true;
      d.startY = y; // no jump by the slop distance
    }
    const moved = y - d.startY;
    d.dy = moved < 0 ? moved * 0.15 : moved; // rubber-band upwards, 1:1 downwards
    d.prevY = d.lastY;
    d.prevT = d.lastT;
    d.lastY = y;
    d.lastT = performance.now();
    sheet.style.transform = `translateY(${d.dy}px)`;
    const past = d.dy > Math.min(DISMISS_DISTANCE_MAX, sheet.offsetHeight * DISMISS_FRACTION);
    if (past !== d.pastThreshold) {
      d.pastThreshold = past;
      haptic.selection();
    }
    scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, d.dy) / sheet.offsetHeight));
    return true;
  };

  const endDrag = () => {
    const d = drag.current;
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    drag.current = null;
    if (!d?.active || !sheet || !scrim) return;
    const dt = Math.max(1, d.lastT - d.prevT);
    const velocity = performance.now() - d.lastT > 80 ? 0 : (d.lastY - d.prevY) / dt;
    const threshold = Math.min(DISMISS_DISTANCE_MAX, sheet.offsetHeight * DISMISS_FRACTION);
    if (d.dy > threshold || (d.dy > 20 && velocity > DISMISS_VELOCITY)) {
      releaseVelocity.current = Math.max(0, velocity);
      onCloseRef.current();
      return;
    }
    const from = sheet.style.transform;
    const scrimFrom = scrim.style.opacity;
    sheet.style.transform = '';
    scrim.style.opacity = '';
    if (d.dy !== 0 && !reducedMotion()) {
      sheet.animate([{ transform: from }, { transform: 'translateY(0)' }], SNAP_BACK);
      scrim.animate([{ opacity: Number(scrimFrom || 1) }, { opacity: 1 }], { duration: SNAP_BACK.duration, easing: 'ease-out' });
    }
  };

  // Touch: native listeners, because only a non-passive touchmove can stop the
  // content from scrolling while the sheet is being dragged
  const handlers = useRef({ beginDrag, moveDrag, endDrag });
  useEffect(() => {
    handlers.current = { beginDrag, moveDrag, endDrag };
  });
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!rendered || !sheet) return;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) handlers.current.beginDrag(e.touches[0].clientY, e.target);
      else drag.current = null;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && handlers.current.moveDrag(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    const onEnd = () => handlers.current.endDrag();
    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [rendered]);

  if (!rendered) return null;

  // Mouse/pen: pointer events (touch is handled above)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    beginDrag(e.clientY, e.target);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !drag.current) return;
    if (moveDrag(e.clientY) && !sheetRef.current?.hasPointerCapture(e.pointerId)) {
      sheetRef.current?.setPointerCapture(e.pointerId);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') endDrag();
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div
        ref={scrimRef}
        className="absolute inset-0 bg-black/40"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          'relative max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-card outline-none',
          'border-t-[1.5px] border-ink/15 shadow-[0_-8px_40px_rgb(0_0_0/0.18)]',
          className,
        )}
        // Own compositor layer up front: no first-frame raster hitch on open/close
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))', willChange: 'transform' }}
      >
        <div
          data-sheet-handle
          className="sticky top-0 z-10 flex cursor-grab justify-center bg-card pt-3 pb-3 active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          <span className="h-1.5 w-10 rounded-full bg-foreground/20" aria-hidden />
        </div>
        <div className="px-5">
          {title && !titleHidden && doneButton ? (
            // A visible, labelled way out — the grab handle alone isn't discoverable
            <div className="flex items-start justify-between gap-3 pb-3">
              <h2 id={titleId} className="text-lg font-bold text-foreground">
                {title}
              </h2>
              <button type="button" onClick={onClose} className="-my-2.5 -mr-2 min-h-11 px-2 text-sm font-semibold text-teal">
                Done
              </button>
            </div>
          ) : (
            title && (
              <h2 id={titleId} className={cn('pb-3 text-lg font-bold text-foreground', titleHidden && 'sr-only')}>
                {title}
              </h2>
            )
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
