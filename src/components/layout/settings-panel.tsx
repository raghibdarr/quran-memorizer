'use client';

import { useState, useEffect, useRef } from 'react';
import BottomSheet from '@/components/ui/bottom-sheet';
import { useSettingsStore } from '@/stores/settings-store';
import { downloadBackup, importBackup } from '@/lib/backup';
import { rehydrateStores } from '@/lib/sync/rehydrate';
import type { ArabicScriptStyle } from '@/types/quran';
import { SettingsIcon } from '@/components/ui/icons';
import { RECITERS } from '@/lib/audio';
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
        'relative h-7 w-12 shrink-0 rounded-full transition-colors',
        enabled ? 'bg-teal' : 'bg-foreground/20'
      )}
    >
      <div
        className={cn(
          'h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(.34,1.45,.64,1)] motion-reduce:transition-none',
          enabled ? 'translate-x-5.5' : 'translate-x-0.5'
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


  // Backup export/import (see src/lib/backup.ts — merge-based restore, never overwrite)
  const importFileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const restored = importBackup(parsed);
      setBackupMsg(`Restored ${restored} data set${restored === 1 ? '' : 's'}`);
      // Rehydrate in place — a reload inside the native shell lands on the root page
      await rehydrateStores();
      // Restored flags that live outside the stores take effect now, not next launch
      const dark = localStorage.getItem('quran-dark-mode');
      if (dark !== null) document.documentElement.classList.toggle('dark', dark === 'true');
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Import failed — is this a Takrar backup file?');
    }
  };


  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        aria-label="Settings"
      >
        <SettingsIcon size={18} />
      </button>

      {/* A bottom sheet (M11c) — was a desktop popover positioned off the gear */}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Settings">
          <div>

            {/* Arabic Script */}
            <div className="mt-5">
              <p className="text-xs font-medium text-muted">Arabic Script</p>
              <div className="mt-1.5 flex gap-1.5">
                {SCRIPT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setArabicScript(opt.value)}
                    className={cn(
                      'min-h-11 flex-1 rounded-xl text-center text-sm font-medium transition-colors',
                      arabicScript === opt.value
                        ? 'bg-teal text-on-teal'
                        : 'bg-foreground/5 text-muted hover:bg-foreground/10'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted">Arabic Font Size</p>
                {Math.round(arabicFontSize * 10) !== 10 && (
                  <button
                    onClick={() => setArabicFontSize(1)}
                    className="-my-3 px-2 py-3 text-xs text-teal hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => setArabicFontSize(Math.max(0.8, Math.round((arabicFontSize - 0.1) * 10) / 10))}
                  disabled={arabicFontSize <= 0.8}
                  className="pressable flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 text-base font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  −
                </button>
                <div className="flex-1 text-center text-xs text-muted">
                  {Math.round(arabicFontSize * 100)}%
                </div>
                <button
                  onClick={() => setArabicFontSize(Math.min(1.6, Math.round((arabicFontSize + 0.1) * 10) / 10))}
                  disabled={arabicFontSize >= 1.6}
                  className="pressable flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 text-base font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            {/* Reciter */}
            <div className="mt-5">
              <p className="text-xs font-medium text-muted">Reciter</p>
              <select
                value={reciter}
                onChange={(e) => setReciter(e.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-xl bg-foreground/5 px-3 text-base font-medium text-foreground outline-none appearance-none cursor-pointer"
                style={{ colorScheme: 'auto' }}
              >
                {RECITERS.map((r) => (
                  <option key={r.id} value={r.id} className="bg-card text-foreground">
                    {r.name}{r.hint ? ` — ${r.hint}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggles */}
            <div className="mt-3 space-y-0.5">
              <label className="flex min-h-11 cursor-pointer items-center justify-between">
                <span className="text-sm text-foreground">Dark Mode</span>
                <Toggle enabled={darkMode} onToggle={handleDarkModeToggle} />
              </label>

              <label className="flex min-h-11 cursor-pointer items-center justify-between">
                <span className="text-sm text-foreground">Transliteration</span>
                <Toggle enabled={transliterationEnabled} onToggle={toggleTransliteration} />
              </label>

              <label className="flex min-h-11 cursor-pointer items-center justify-between">
                <span className="text-sm text-foreground">Translation</span>
                <Toggle enabled={translationEnabled} onToggle={toggleTranslation} />
              </label>
            </div>

            {/* Daily Goal */}
            <div className="mt-5">
              <p className="text-xs font-medium text-muted">Daily Goal</p>
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => setDailyGoalActivities(Math.max(1, dailyGoalActivities - 1))}
                  disabled={dailyGoalActivities <= 1}
                  className="pressable flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 text-base font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  −
                </button>
                <div className="flex-1 text-center text-xs text-muted">
                  <span className="mr-1 font-semibold text-teal">{dailyGoalActivities}</span>{dailyGoalActivities === 1 ? 'lesson, review or practice' : 'lessons, reviews or practices'} / day
                </div>
                <button
                  onClick={() => setDailyGoalActivities(Math.min(10, dailyGoalActivities + 1))}
                  disabled={dailyGoalActivities >= 10}
                  className="pressable flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 text-base font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            {/* Data — backup & restore */}
            <div className="mt-5">
              <p className="text-xs font-medium text-muted">Your Data</p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() => {
                    try { downloadBackup(); setBackupMsg('Backup downloaded ✓'); }
                    catch { setBackupMsg('Export failed — try again'); }
                  }}
                  className="min-h-11 flex-1 rounded-xl bg-foreground/5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/10"
                >
                  Export backup
                </button>
                <button
                  onClick={() => importFileRef.current?.click()}
                  className="min-h-11 flex-1 rounded-xl bg-foreground/5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/10"
                >
                  Import backup
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-muted/80">
                {backupMsg ?? 'Progress lives on this device — export a backup, or sign in to sync.'}
              </p>
            </div>

            {/* Data credits — quran-align is CC BY 4.0, so this attribution is a license requirement */}
            <p className="mt-4 border-t border-foreground/10 pt-3 text-center text-[10px] leading-relaxed text-muted/80">
              Recitations: EveryAyah.com · Word timings: QUL (Tarteel) &amp; quran-align (CC BY 4.0)
            </p>
          </div>
      </BottomSheet>
    </div>
  );
}
