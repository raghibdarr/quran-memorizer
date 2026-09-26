'use client';

// Native-shell glue (M11). Everything here is a no-op on the web, so callers
// never need their own platform checks.

import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';
import { animatedHistoryBack, canGoBack } from './nav-history';

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

  // Android hardware/gesture back: pop the in-app stack WITH the back animation
  // (a plain WebView goBack skips it — see animatedHistoryBack); at the root,
  // leave the app like any native app does. Registering replaces the default.
  const backListener = App.addListener('backButton', () => {
    if (canGoBack()) animatedHistoryBack('back');
    else App.exitApp();
  });

  return () => {
    observer.disconnect();
    backListener.then((l) => l.remove());
  };
}
