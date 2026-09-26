'use client';

// Haptics (M11e, pulled forward on the owner's request). Native shells only —
// the web Vibration API is a coarse motor buzz on Android and absent on iOS, so
// on the web every call is a no-op, like the rest of src/lib/native.ts.
//
// The platform standard (Apple HIG, Android haptics guidelines): feedback marks
// meaningful moments, not every tap. Where Takrar uses each kind:
//   press      light impact — the tactile-print buttons/chips that visibly
//              depress (installed globally by installPressHaptics)
//   selection  a value or position changed — tab bar, segmented controls,
//              card-deck swipes, steppers, a sheet crossing its dismiss point
//   success    something finished — lesson, review session, the day's plan
//
// The OS switches (iOS "System Haptics", Android "Touch feedback") still apply;
// the in-app toggle is per device, so it lives in localStorage, not synced settings.

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './native';

const KEY = 'haptics-enabled';

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, String(on));
  } catch { /* ignore */ }
}

const active = () => isNative() && hapticsEnabled();

// Both native implementations drop selectionChanged() unless a selection
// "session" was started first — start one on first use and keep it open
let selectionReady = false;

export const haptic = {
  press() {
    if (active()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  selection() {
    if (!active()) return;
    if (!selectionReady) {
      selectionReady = true;
      Haptics.selectionStart()
        .then(() => Haptics.selectionChanged())
        .catch(() => {});
      return;
    }
    Haptics.selectionChanged().catch(() => {});
  },
  success() {
    if (active()) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
};

/**
 * Light impact on pointer-down for every tactile-print control, app-wide — the
 * haptic lands with the visual press rather than on release. Returns a cleanup.
 */
export function installPressHaptics(): () => void {
  if (!isNative()) return () => {};
  const onDown = (e: PointerEvent) => {
    const el = (e.target as Element | null)?.closest?.('.tactile-btn, .tactile-chip');
    if (el && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true') haptic.press();
  };
  document.addEventListener('pointerdown', onDown, { passive: true, capture: true });
  return () => document.removeEventListener('pointerdown', onDown, { capture: true });
}
