'use client';

import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import type { ArabicScriptStyle } from '@/types/quran';
import { SettingsIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const SCRIPT_OPTIONS: { value: ArabicScriptStyle; label: string }[] = [
  { value: 'tajweed', label: 'Tajweed' },
  { value: 'uthmani', label: 'Uthmani' },
  { value: 'indopak', label: 'IndoPak' },
];

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'h-5 w-9 rounded-full transition-colors',
        enabled ? 'bg-teal' : 'bg-foreground/20'
      )}
    >
      <div
        className={cn(
          'h-4 w-4 rounded-full bg-white shadow transition-transform',
          enabled ? 'translate-x-4.5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

export default function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const {
    arabicScript,
    setArabicScript,
    arabicFontSize,
    setArabicFontSize,
    transliterationEnabled,
    toggleTransliteration,
    translationEnabled,
    toggleTranslation,
  } = useSettingsStore();

  // Initialize dark mode from localStorage or system preference
  useEffect(() => {
    const saved = localStorage.getItem('quran-dark-mode');
    const isDark = saved !== null
      ? saved === 'true'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(isDark);
  }, []);

  // Sync Arabic font size to CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--arabic-font-scale', String(arabicFontSize));
  }, [arabicFontSize]);

  const handleDarkModeToggle = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('quran-dark-mode', String(next));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        aria-label="Settings"
      >
        <SettingsIcon size={18} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-10 z-50 w-64 rounded-xl bg-card p-4 shadow-lg border border-foreground/10">
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

            {/* Font Size */}
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted">Arabic Font Size</p>
                {Math.round(arabicFontSize * 10) !== 10 && (
                  <button
                    onClick={() => setArabicFontSize(1)}
                    className="text-[10px] text-teal hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => setArabicFontSize(Math.max(0.8, Math.round((arabicFontSize - 0.1) * 10) / 10))}
                  disabled={arabicFontSize <= 0.8}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/5 text-sm font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  −
                </button>
                <div className="flex-1 text-center text-xs text-muted">
                  {Math.round(arabicFontSize * 100)}%
                </div>
                <button
                  onClick={() => setArabicFontSize(Math.min(1.6, Math.round((arabicFontSize + 0.1) * 10) / 10))}
                  disabled={arabicFontSize >= 1.6}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/5 text-sm font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            {/* Toggles */}
            <div className="mt-3 space-y-2.5">
              <label className="flex items-center justify-between">
                <span className="text-xs text-foreground">Dark Mode</span>
                <Toggle enabled={darkMode} onToggle={handleDarkModeToggle} />
              </label>

              <label className="flex items-center justify-between">
                <span className="text-xs text-foreground">Transliteration</span>
                <Toggle enabled={transliterationEnabled} onToggle={toggleTransliteration} />
              </label>

              <label className="flex items-center justify-between">
                <span className="text-xs text-foreground">Translation</span>
                <Toggle enabled={translationEnabled} onToggle={toggleTranslation} />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
