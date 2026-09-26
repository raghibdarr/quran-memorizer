import type { CapacitorConfig } from '@capacitor/cli';

// Native shells (M11). The apps bundle the static export (out/) — never a remote
// URL: offline-first, no launch flash, and not a "repackaged website" in App
// Store review terms. Build: `npm run build && npx cap sync`.
const config: CapacitorConfig = {
  // PLACEHOLDER bundle id — becomes permanent at the first store upload; the
  // owner confirms the final value before M11e (see m11 spec §5b).
  appId: 'app.takrar.quran',
  appName: 'Takrar',
  webDir: 'out',
  backgroundColor: '#FEFCF9',
  ios: {
    // Content runs under the status bar; headers pad with env(safe-area-inset-top).
    // WKWebView's native swipe-back stays OFF (Capacitor's default) — M11b owns
    // edge-swipe-back and the two would fight.
    contentInset: 'never',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // Android: with the app's viewport-fit=cover, env(safe-area-inset-*) carries
      // real values on modern WebViews; older ones get native padding and 0 insets.
      // Either way CSS env() is the single safe-area mechanism on both platforms.
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
    SplashScreen: {
      // Hidden from JS once the app has mounted (src/lib/native.ts); the timed
      // auto-hide is only a safety net so a JS failure can't strand the splash.
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: '#FEFCF9',
      showSpinner: false,
    },
  },
};

export default config;
