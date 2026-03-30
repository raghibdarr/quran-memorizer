'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '@/stores/settings-store';
import type { ArabicScriptStyle } from '@/types/quran';
import { SettingsIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const SCRIPT_OPTIONS: { value: ArabicScriptStyle; label: string }[] = [
  { value: 'tajweed', label: 'Tajweed' },
  { value: 'uthmani', label: 'Uthmani' },
  { value: 'indopak', label: 'IndoPak' },
];

const RECITERS: { value: string; label: string }[] = [
  { value: 'Alafasy_128kbps', label: 'Mishary Alafasy' },
  { value: 'Husary_128kbps', label: 'Mahmoud Al-Hussary' },
  { value: 'Abdul_Basit_Murattal_192kbps', label: 'Abdul Basit (Murattal)' },
  { value: 'Minshawy_Murattal_128kbps', label: 'Al-Minshawy (Murattal)' },
  { value: 'Nasser_Alqatami_128kbps', label: 'Nasser Al-Qatami' },
  { value: 'Yasser_Ad-Dussary_128kbps', label: 'Yasser Ad-Dussary' },
  { value: 'Hudhaify_128kbps', label: 'Ali Al-Hudhaify' },
  { value: 'Maher_AlMuaiqly_64kbps', label: 'Maher Al-Muaiqly' },
  { value: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', label: 'Ahmed Al-Ajamy' },
  { value: 'Muhammad_Jibreel_128kbps', label: 'Muhammad Jibreel' },
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
    reciter,
    setReciter,
    arabicScript,
    setArabicScript,
    arabicFontSize,
    setArabicFontSize,
    transliterationEnabled,
    toggleTransliteration,
    translationEnabled,
    toggleTranslation,
    dailyGoalActivities,
    setDailyGoalActivities,
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

  const btnRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [open]);

  return (
    <div>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        aria-label="Settings"
      >
        <SettingsIcon size={18} />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />

          <div
            className="fixed z-[70] w-64 rounded-xl bg-card p-4 shadow-lg border border-foreground/10 max-h-[80vh] overflow-y-auto"
            style={{ top: panelPos.top, right: panelPos.right }}
          >
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

            {/* Reciter */}
            <div className="mt-3">
              <p className="text-xs font-medium text-muted">Reciter</p>
              <select
                value={reciter}
                onChange={(e) => setReciter(e.target.value)}
                className="mt-1.5 w-full rounded-lg bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground outline-none appearance-none cursor-pointer"
                style={{ colorScheme: 'auto' }}
              >
                {RECITERS.map((r) => (
                  <option key={r.value} value={r.value} className="bg-card text-foreground">{r.label}</option>
                ))}
              </select>
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

            {/* Daily Goal */}
            <div className="mt-3">
              <p className="text-xs font-medium text-muted">Daily Goal</p>
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => setDailyGoalActivities(Math.max(1, dailyGoalActivities - 1))}
                  disabled={dailyGoalActivities <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/5 text-sm font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  −
                </button>
                <div className="flex-1 text-center text-xs text-muted">
                  <span className="mr-1 font-semibold text-teal">{dailyGoalActivities}</span>{dailyGoalActivities === 1 ? 'lesson, review or practice' : 'lessons, reviews or practices'} / day
                </div>
                <button
                  onClick={() => setDailyGoalActivities(Math.min(10, dailyGoalActivities + 1))}
                  disabled={dailyGoalActivities >= 10}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/5 text-sm font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
