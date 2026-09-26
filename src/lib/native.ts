'use client';

// Native-shell glue (M11). Everything here is a no-op on the web, so callers
// never need their own platform checks.

import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const nativePlatform = (): 'ios' | 'android' | 'web' =>
  Capacitor.getPlatform() as 'ios' | 'android' | 'web';

/** Status-bar icons must contrast with the APP's theme, which the user can set
 *  independently of the OS theme — so follow the `dark` class, not the device. */
function syncSystemBars() {
  const dark = document.documentElement.classList.contains('dark');
  SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

/** One-time native setup; call once the app has mounted. Returns a cleanup. */
export function initNativeShell(): () => void {
  if (!isNative()) return () => {};

  document.documentElement.dataset.native = nativePlatform();
  SplashScreen.hide().catch(() => {});

  syncSystemBars();
  const observer = new MutationObserver(syncSystemBars);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
