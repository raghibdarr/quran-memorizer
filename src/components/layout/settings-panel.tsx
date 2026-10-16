'use client';

import { useState, useEffect, useRef } from 'react';
import BottomSheet from '@/components/ui/bottom-sheet';
import { useSettingsStore } from '@/stores/settings-store';
import { downloadBackup, importBackup } from '@/lib/backup';
import EraseDevice from './erase-device';
import Link from '@/components/app-link';
import { rehydrateStores } from '@/lib/sync/rehydrate';
import type { ArabicScriptStyle, Ayah } from '@/types/quran';
import { CheckIcon, ChevronDownIcon, SettingsIcon } from '@/components/ui/icons';
import ArabicText from '@/components/ui/arabic-text';
import { getSurah } from '@/lib/quran-data';
import { RECITERS } from '@/lib/audio';
import { cn } from '@/lib/cn';
import { haptic, hapticsEnabled, setHapticsEnabled } from '@/lib/haptics';
import { isNative } from '@/lib/native';
import { turnOnReminders, useReminderStore } from '@/stores/reminder-store';
import { useAuth } from '@/hooks/use-auth';
import { disablePushReminder, enablePushReminder, getEmailDigest, getPushReminder, pushAvailability, setEmailDigest, setPushReminderHour } from '@/lib/web-push';
import SyncPitch from '@/components/auth/sync-pitch';
import { TRANSLATIONS } from '@/components/ui/translation-text';
import translationSources from '@/data/translation-sources.json';

const pad = (n: number) => String(n).padStart(2, '0');

/** Arabic-name transliterations vary (Al-/Ar-/At-, Hudhaify/Huthaifi): match on letters only */
const fold = (s: string) => s.toLowerCase().replace(/\b(al|ar|at|as|ad|ash|an)-/g, '').replace(/[^a-z]/g, '');

function ReciterPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = RECITERS.find((r) => r.id === value) ?? RECITERS[0];
  const q = fold(query);
  const shown = q ? RECITERS.filter((r) => [r.name, ...(r.aka ?? [])].some((n) => fold(n).includes(q))) : RECITERS;
  const listRef = useRef<HTMLDivElement>(null);

  // Opening scrolls the chosen reciter into view inside the list
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const close = () => { setOpen(false); setQuery(''); };
  return (
    <div className="mt-5">
      <p className="text-xs font-medium text-muted">Reciter</p>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="pressable mt-1.5 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-foreground/5 px-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{current.name}</span>
          {current.hint && <span className="block truncate text-xs text-muted">{current.hint}</span>}
        </span>
        <ChevronDownIcon size={16} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-foreground/10">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${RECITERS.length} reciters`}
            aria-label="Search reciters"
            className="w-full border-b border-foreground/10 bg-transparent px-3 py-2.5 text-base text-foreground placeholder:text-muted focus:outline-none"
          />
          {/* about five rows tall; the rest scrolls */}
          <div ref={listRef} role="radiogroup" aria-label="Reciter" className="max-h-64 overflow-y-auto overscroll-contain">
          {shown.length === 0 && <p className="px-3 py-3 text-sm text-muted">No reciter matches “{query}”</p>}
          {shown.map((r) => {
            const selected = r.id === value;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => { haptic.selection(); onChange(r.id); close(); }}
                className={cn(
                  'flex min-h-12 w-full items-center justify-between gap-3 border-b border-foreground/5 px-3 py-2 text-left last:border-b-0',
                  selected ? 'bg-teal/5' : 'hover:bg-foreground/5',
                )}
              >
                <span className="min-w-0">
                  <span className={cn('block text-sm', selected ? 'font-semibold text-teal' : 'text-foreground')}>{r.name}</span>
                  {r.hint && <span className="block text-xs text-muted">{r.hint}</span>}
                </span>
                {selected && <CheckIcon size={16} className="shrink-0 text-teal" />}
              </button>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Daily reminder (M8, native only): on/off + time. Permission is asked on the switch, never unprompted. */
function ReminderSettings() {
  const enabled = useReminderStore((s) => s.enabled);
  const time = useReminderStore((s) => s.time);
  const setEnabled = useReminderStore((s) => s.setEnabled);
  const setTime = useReminderStore((s) => s.setTime);
  const [blocked, setBlocked] = useState(false);

  const toggle = async () => {
    if (enabled) {
      setEnabled(false);
      return;
    }
    const result = await turnOnReminders();
    setBlocked(result === 'blocked');
  };

  return (
    <div className="mt-5">
      <label className="flex min-h-11 cursor-pointer items-center justify-between">
        <span>
          <span className="block text-sm text-foreground">Daily reminder</span>
          <span className="block text-xs text-muted">Only on days with something to do</span>
        </span>
        <Toggle enabled={enabled} onToggle={toggle} />
      </label>
      {enabled && (
        <label className="mt-1 flex min-h-11 items-center justify-between">
          <span className="text-sm text-foreground">Time</span>
          <input
            type="time"
            value={`${pad(time.hour)}:${pad(time.minute)}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              if (Number.isFinite(h) && Number.isFinite(m)) setTime({ hour: h, minute: m });
            }}
            className="min-h-11 rounded-xl bg-foreground/5 px-3 text-base font-medium text-foreground"
          />
        </label>
      )}
      {blocked && (
        <p className="mt-1 text-xs text-muted">
          Notifications are turned off for Takrar. Allow them in your phone&apos;s settings, then try again.
        </p>
      )}
    </div>
  );
}

/**
 * Reminders on the web (M8): a daily push in this browser at a chosen hour, and the
 * opt-in weekly email for when you fall behind. Both are sent by the server from
 * synced data, so they need an account. The phone apps use ReminderSettings instead.
 */
function WebReminderSettings() {
  const auth = useAuth();
  const [push, setPush] = useState<{ hour: number } | null>(null);
  const [digest, setDigest] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const availability = pushAvailability();

  useEffect(() => {
    if (!auth.user) return;
    getPushReminder().then(setPush).catch(() => {});
    getEmailDigest().then(setDigest).catch(() => {});
  }, [auth.user]);

  if (auth.loading) return null;
  if (!auth.user) {
    return (
      <p className="mt-5 text-xs leading-relaxed text-muted">
        Sign in to get a daily reminder in this browser, and an email if you fall behind.
      </p>
    );
  }

  const togglePush = async () => {
    setNote(null);
    if (push) {
      await disablePushReminder();
      setPush(null);
      return;
    }
    const result = await enablePushReminder(19);
    if (result === 'ok') setPush({ hour: 19 });
    else setNote(result === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.' : "Couldn't turn reminders on. Try again later.");
  };

  const toggleDigest = async () => {
    setNote(null);
    const ok = await setEmailDigest(!digest);
    if (ok) setDigest(!digest);
    else setNote("Couldn't save that. Try again later.");
  };

  return (
    <div className="mt-5 space-y-1">
      {availability === 'ok' && (
        <>
          <label className="flex min-h-11 cursor-pointer items-center justify-between">
            <span>
              <span className="block text-sm text-foreground">Daily reminder in this browser</span>
              <span className="block text-xs text-muted">Only on days with reviews due</span>
            </span>
            <Toggle enabled={!!push} onToggle={togglePush} />
          </label>
          {push && (
            <label className="flex min-h-11 items-center justify-between">
              <span className="text-sm text-foreground">Time</span>
              <select
                value={push.hour}
                onChange={async (e) => {
                  const hour = Number(e.target.value);
                  if (await setPushReminderHour(hour)) setPush({ hour });
                }}
                className="min-h-11 rounded-xl bg-foreground/5 px-3 text-base font-medium text-foreground"
              >
                {Array.from({ length: 19 }, (_, i) => i + 5).map((h) => <option key={h} value={h}>{`${pad(h)}:00`}</option>)}
              </select>
            </label>
          )}
        </>
      )}
      {availability === 'install-first' && (
        <p className="text-xs text-muted">On iPhone, add Takrar to your Home Screen (Share, then Add to Home Screen) to get reminders.</p>
      )}
      <label className="flex min-h-11 cursor-pointer items-center justify-between">
        <span>
          <span className="block text-sm text-foreground">Weekly email if you fall behind</span>
          <span className="block text-xs text-muted">Only after a week away with reviews waiting</span>
        </span>
        <Toggle enabled={digest} onToggle={toggleDigest} />
      </label>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

/** Large enough for low vision; the preview line shows what each step means */
const MAX_ARABIC_SCALE = 2;

const SCRIPT_OPTIONS: { value: ArabicScriptStyle; label: string }[] = [
  { value: 'tajweed', label: 'Tajweed' },
  { value: 'uthmani', label: 'Uthmani' },
  { value: 'indopak', label: 'IndoPak' },
];

/** A link out to a source's own site */
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{children}</a>;
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
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
    hideStats,
    toggleHideStats,
    translationId,
    setTranslationId,
  } = useSettingsStore();
  const [haptics, setHaptics] = useState(hapticsEnabled);
  const [sample, setSample] = useState<Ayah | null>(null);
  useEffect(() => {
    if (open && !sample) getSurah(1).then((s) => setSample(s.ayahs[0]));
  }, [open, sample]);

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
      setBackupMsg(err instanceof Error ? err.message : 'Import failed. Is this a Takrar backup file?');
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
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Settings" doneButton>
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
                  onClick={() => { haptic.selection(); setArabicFontSize(Math.max(0.8, Math.round((arabicFontSize - 0.1) * 10) / 10)); }}
                  disabled={arabicFontSize <= 0.8}
                  aria-label="Smaller Arabic text"
                  className="pressable flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 text-base font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  −
                </button>
                {/* Live preview: the stepper changes something you can see */}
                <div className="min-w-0 flex-1 overflow-hidden text-center">
                  {/* A real ayah through the same renderer as lessons, so tajweed colours show */}
                  <div dir="rtl" aria-hidden className="text-foreground" style={{ fontSize: '1.125rem' }}>
                    {sample ? <ArabicText ayah={sample} className="leading-loose" /> : <div className="h-9" />}
                  </div>
                  <p className="text-[11px] text-muted">{Math.round(arabicFontSize * 100)}%</p>
                </div>
                <button
                  onClick={() => { haptic.selection(); setArabicFontSize(Math.min(MAX_ARABIC_SCALE, Math.round((arabicFontSize + 0.1) * 10) / 10)); }}
                  disabled={arabicFontSize >= MAX_ARABIC_SCALE}
                  aria-label="Larger Arabic text"
                  className="pressable flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 text-base font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            {/* Reciter: an in-sheet list, not the OS dropdown (which ignored the app's theme) */}
            <ReciterPicker value={reciter} onChange={setReciter} />
            <Link href="/downloads" className="mt-1.5 flex min-h-11 items-center justify-between rounded-xl bg-foreground/5 px-3 text-sm font-medium text-foreground hover:bg-foreground/10" data-downloads-link>
              Download recitations for offline
              <span aria-hidden className="text-muted">›</span>
            </Link>

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

              {translationEnabled && (
                <div className="-mt-1 flex gap-2 pb-1" role="group" aria-label="English translation">
                  {(['saheeh', 'clear'] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={(translationId ?? 'saheeh') === id}
                      onClick={() => setTranslationId(id)}
                      className={cn('min-h-11 flex-1 rounded-xl px-3 text-xs font-semibold', (translationId ?? 'saheeh') === id ? 'bg-teal text-on-teal' : 'bg-foreground/[0.05] text-foreground/80')}
                      data-translation-choice={id}
                    >
                      {TRANSLATIONS[id].name}
                    </button>
                  ))}
                </div>
              )}

              <label className="flex min-h-11 cursor-pointer items-center justify-between">
                <span className="text-sm text-foreground">Hide streaks and counts</span>
                <Toggle enabled={!!hideStats} onToggle={toggleHideStats} />
              </label>

              {isNative() && (
                <label className="flex min-h-11 cursor-pointer items-center justify-between">
                  <span className="text-sm text-foreground">Haptics</span>
                  <Toggle
                    enabled={haptics}
                    onToggle={() => {
                      setHapticsEnabled(!haptics);
                      setHaptics(!haptics);
                      if (!haptics) haptic.press();
                    }}
                  />
                </label>
              )}
            </div>

            {isNative() ? <ReminderSettings /> : <WebReminderSettings />}

            {/* Daily Goal */}
            <div className="mt-5">
              <p className="text-xs font-medium text-muted">Daily Goal</p>
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => { haptic.selection(); setDailyGoalActivities(Math.max(1, dailyGoalActivities - 1)); }}
                  disabled={dailyGoalActivities <= 1}
                  className="pressable flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 text-base font-bold text-muted hover:bg-foreground/10 disabled:opacity-30"
                >
                  −
                </button>
                <div className="flex-1 text-center text-xs text-muted">
                  <span className="mr-1 font-semibold text-teal">{dailyGoalActivities}</span>{dailyGoalActivities === 1 ? 'lesson, review or practice' : 'lessons, reviews or practices'} / day
                </div>
                <button
                  onClick={() => { haptic.selection(); setDailyGoalActivities(Math.min(10, dailyGoalActivities + 1)); }}
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
                    catch { setBackupMsg('Export failed. Please try again.'); }
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
                {backupMsg ?? 'Your progress is saved on this device. Export a backup, or sign in to sync it.'}
              </p>
              {backupMsg === 'Backup downloaded ✓' && <SyncPitch moment="backup" className="mt-3" />}
              <EraseDevice />
            </div>

            {/* Sources: several licences (Tanzil, CC BY 4.0, QuranEnc) require this credit;
                public/licenses.txt holds every notice in full (scripts/build-licenses.mjs) */}
            <div className="mt-4 border-t border-foreground/10 pt-3 text-[11px] leading-relaxed text-muted" data-sources>
              <p className="mb-1 font-semibold text-foreground/80">Sources</p>
              <ul className="space-y-0.5">
                <li>Quran text: <Ext href="https://tanzil.net">Tanzil Project</Ext> (CC BY 3.0, unchanged)</li>
                <li>Saheeh International, from <Ext href={translationSources.saheeh.url}>QuranEnc.com</Ext> ({translationSources.saheeh.version.match(/\(([^)]+)\)/)?.[1]})</li>
                <li>The Clear Quran: translation by Talal Itani, <Ext href="https://clearquran.com">ClearQuran.com</Ext> (CC BY-ND 4.0)</li>
                <li>Tajweed colours: <Ext href="https://github.com/cpfair/quran-tajweed">cpfair/quran-tajweed</Ext> (CC BY 4.0)</li>
                <li>Arabic font: <Ext href="https://github.com/aliftype/amiri">Amiri Quran</Ext> (OFL) · IndoPak text and font, mushaf font: <Ext href="https://github.com/DigitalKhatt">DigitalKhatt</Ext> by Amine Anane (MIT, OFL)</li>
                <li>Mushaf pages: <Ext href="https://github.com/tarekeldeeb/quran-madina-html">quran-madina-html</Ext> (Waqf GPL 2.0)</li>
                <li>Recitations: EveryAyah.com, MP3Quran.net, QuranicAudio.com · Word timings: <Ext href="https://github.com/cpfair/quran-align">quran-align</Ext> and Qur&apos;anic Universal Audio (CC BY 4.0)</li>
                <li>Word meanings: <Ext href="https://corpus.quran.com">Quranic Arabic Corpus</Ext> · Voice check: <Ext href="https://github.com/yazinsai/tilawa">Tilawa</Ext> (NPL 1.2) · Transliteration: Takrar</li>
              </ul>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">
              <a href="/licenses.txt" target="_blank" rel="noopener" className="underline underline-offset-2">Notices and licences</a>
              {' · '}
              <Link href="/privacy" className="underline underline-offset-2">Privacy policy</Link>
            </p>
          </div>
      </BottomSheet>
    </div>
  );
}
