'use client';

import BottomSheet from './bottom-sheet';
import { cn } from '@/lib/cn';

/** Yes/no confirmation as a bottom sheet (M11c) — thumb-reachable buttons, 48px tall */
export default function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-muted">{message}</p>
      <div className="mt-5 flex flex-col gap-2.5">
        <button
          onClick={onConfirm}
          className={cn(
            'tactile-chip min-h-12 rounded-xl text-sm font-semibold',
            destructive ? 'bg-miss text-on-miss' : 'bg-teal text-on-teal',
          )}
        >
          {confirmLabel}
        </button>
        <button onClick={onCancel} className="min-h-12 rounded-xl text-sm font-semibold text-muted hover:text-foreground">
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}
