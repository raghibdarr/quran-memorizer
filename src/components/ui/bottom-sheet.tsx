'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

// Motion (M11 spec §3): entrances settle with --spring-settle; exits use the nav ease.
const ENTER = { duration: 460, easing: 'cubic-bezier(.22,1.2,.36,1)' };
const EXIT = { duration: 240, easing: 'cubic-bezier(.32,.72,0,1)' };
const DISMISS_DISTANCE = 120; // px dragged down…
const DISMISS_VELOCITY = 0.6; // …or px/ms flicked

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Visually hidden title for sheets whose content carries its own heading */
  titleHidden?: boolean;
  /** Celebrations/acknowledgements can require their button; default: drag, scrim and Esc close */
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * THE modal surface (M11c): every panel, picker, confirm and celebration is a
 * sheet rising from the bottom — grab handle, spring entrance, drag-to-dismiss,
 * scrim tap, Esc; body scroll locked, focus moved in and restored. Stays mounted
 * through its exit animation, so callers just flip `open`.
 */
export default function BottomSheet({ open, onClose, title, titleHidden, dismissible = true, className, children }: BottomSheetProps) {
  const [rendered, setRendered] = useState(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

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
    const from = sheet.style.transform || 'translateY(0)';
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { ...EXIT, fill: 'forwards' });
    sheet.animate([{ transform: from }, { transform: 'translateY(100%)' }], { ...EXIT, fill: 'forwards' }).finished.then(finish);
  }, [open, rendered]);

  // Body scroll lock + Esc while shown
  useEffect(() => {
    if (!rendered) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [rendered, dismissible, onClose]);

  if (!rendered) return null;

  // Drag-to-dismiss: from the handle area anywhere, or from the content when it's scrolled to the top
  const onPointerDown = (e: React.PointerEvent) => {
    if (!dismissible) return;
    const sheet = sheetRef.current;
    const fromHandle = (e.target as HTMLElement).closest('[data-sheet-handle]');
    if (!sheet || (!fromHandle && sheet.scrollTop > 0)) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (!d || !sheet) return;
    const raw = e.clientY - d.y;
    if (raw > 4 && !sheet.hasPointerCapture(e.pointerId)) sheet.setPointerCapture(e.pointerId);
    // Rubber-band upwards, 1:1 downwards
    d.dy = raw < 0 ? raw * 0.15 : raw;
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    const sheet = sheetRef.current;
    drag.current = null;
    if (!d || !sheet) return;
    const velocity = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > DISMISS_DISTANCE || (d.dy > 20 && velocity > DISMISS_VELOCITY)) {
      onClose();
      return;
    }
    const from = sheet.style.transform;
    sheet.style.transform = '';
    if (d.dy !== 0 && !reducedMotion()) {
      sheet.animate([{ transform: from }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.34,1.45,.64,1)' });
    }
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
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))', touchAction: 'pan-y' }}
      >
        <div data-sheet-handle className="sticky top-0 z-10 flex cursor-grab justify-center bg-card pt-2.5 pb-2 active:cursor-grabbing">
          <span className="h-1.5 w-10 rounded-full bg-foreground/20" aria-hidden />
        </div>
        <div className="px-5">
          {title && (
            <h2 id={titleId} className={cn('pb-3 text-lg font-bold text-foreground', titleHidden && 'sr-only')}>
              {title}
            </h2>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
