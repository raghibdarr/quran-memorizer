'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Capture the event globally before React hydrates — it only fires once
let _deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = (window.navigator as any).standalone === true;
  return isIOS && !isStandalone;
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default true to avoid flash

  useEffect(() => {
    // Don't show if already installed as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Don't show if previously dismissed
    if (localStorage.getItem('pwa-banner-dismissed')) return;

    setDismissed(false);

    // Check if we already captured the event before React mounted
    if (_deferredPrompt) {
      setDeferredPrompt(_deferredPrompt);
    }

    // Also listen for future events (in case it hasn't fired yet)
    const handler = (e: Event) => {
      e.preventDefault();
      _deferredPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari detection
    if (isIOSSafari()) {
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
      _deferredPrompt = null;
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSPrompt(false);
    _deferredPrompt = null;
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
