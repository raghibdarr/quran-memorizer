'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Don't show if previously dismissed
    if (localStorage.getItem('pwa-banner-dismissed')) return;

    // Android/Chrome: capture the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: detect Safari on iOS (no beforeinstallprompt support)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setShowIOSPrompt(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSPrompt(false);
    localStorage.setItem('pwa-banner-dismissed', '1');
  };

  if (dismissed || (!deferredPrompt && !showIOSPrompt)) return null;

  return (
    <div className="rounded-xl border border-teal/20 bg-teal/5 p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Install Takrar</p>
          <p className="mt-0.5 text-xs text-muted">
            {showIOSPrompt
              ? 'Tap the share button, then "Add to Home Screen"'
              : 'Add to your home screen for quick access'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white"
            >
              Install
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-foreground"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
