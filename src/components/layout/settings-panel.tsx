'use client';

import { useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import type { ArabicScriptStyle } from '@/types/quran';
import { cn } from '@/lib/cn';

const SCRIPT_OPTIONS: { value: ArabicScriptStyle; label: string; desc: string }[] = [
  { value: 'tajweed', label: 'Tajweed', desc: 'Color-coded rules' },
  { value: 'uthmani', label: 'Uthmani', desc: 'Standard script' },
  { value: 'indopak', label: 'IndoPak', desc: 'Nastaliq style' },
];

export default function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const {
    arabicScript,
    setArabicScript,
    transliterationEnabled,
    toggleTransliteration,
    translationEnabled,
    toggleTranslation,
  } = useSettingsStore();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        aria-label="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-10 z-50 w-64 rounded-xl bg-white p-4 shadow-lg border border-foreground/10">
            <h3 className="text-sm font-bold text-foreground">Settings</h3>

            {/* Arabic Script */}
            <div className="mt-3">
              <p className="text-xs font-medium text-muted">Arabic Script</p>
              <div className="mt-1.5 flex gap-1.5">
                {SCRIPT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setArabicScript(opt.value)}
                    className={cn(
                      'flex-1 rounded-lg py-1.5 text-center text-xs font-medium transition-colors',
                      arabicScript === opt.value
                        ? 'bg-teal text-white'
                        : 'bg-foreground/5 text-muted hover:bg-foreground/10'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="mt-3 space-y-2">
              <label className="flex items-center justify-between">
                <span className="text-xs text-foreground">Transliteration</span>
                <button
                  onClick={toggleTransliteration}
                  className={cn(
                    'h-5 w-9 rounded-full transition-colors',
                    transliterationEnabled ? 'bg-teal' : 'bg-foreground/20'
                  )}
                >
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full bg-white shadow transition-transform',
                      transliterationEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </label>

              <label className="flex items-center justify-between">
                <span className="text-xs text-foreground">Translation</span>
                <button
                  onClick={toggleTranslation}
                  className={cn(
                    'h-5 w-9 rounded-full transition-colors',
                    translationEnabled ? 'bg-teal' : 'bg-foreground/20'
                  )}
                >
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full bg-white shadow transition-transform',
                      translationEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
