'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { SurahMeta } from '@/types/quran';
import { getSurahIndex } from '@/lib/quran-data';
import { RECITERS } from '@/lib/reciters';
import BackButton from '@/components/ui/back-button';
import SegmentedControl from '@/components/ui/segmented-control';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/lib/cn';
import {
  activeJob,
  cancelDownload,
  deleteSurah,
  downloadSurah,
  downloadedSurahs,
  formatBytes,
  subscribeDownloads,
  totalBytes,
} from '@/lib/downloads';

let version = 0;
const bump = () => { version++; };
function useDownloadsVersion() {
  return useSyncExternalStore(
    (fn) => subscribeDownloads(() => { bump(); fn(); }),
    () => version,
    () => 0,
  );
}

/** Offline recitations (roadmap #02): per reciter, per surah, kept on this device */
export default function DownloadsPage() {
  const reciter = useSettingsStore((s) => s.reciter);
  const reciterName = RECITERS.find((r) => r.id === reciter)?.name ?? reciter;
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [filter, setFilter] = useState<'all' | 'downloaded'>('all');
  const [failed, setFailed] = useState<Record<number, string>>({});
  useDownloadsVersion();

  useEffect(() => {
    getSurahIndex().then((idx) => setSurahs([...idx].sort((a, b) => a.id - b.id)));
  }, []);

  const done = downloadedSurahs(reciter);
  const shown = useMemo(
    () => (filter === 'downloaded' ? surahs.filter((s) => done[String(s.id)]) : surahs),
    [filter, surahs, done],
  );
  const juz30 = surahs.filter((s) => s.id >= 78);
  const juz30Left = juz30.filter((s) => !done[String(s.id)] && !activeJob(reciter, s.id));

  const start = (s: SurahMeta) => {
    setFailed((f) => { const n = { ...f }; delete n[s.id]; return n; });
    downloadSurah(reciter, s.id, s.versesCount).catch((e: Error) => {
      if (e.message !== 'cancelled') setFailed((f) => ({ ...f, [s.id]: "Couldn't download. Check your connection and try again." }));
    });
  };

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <BackButton fallback="/" />
          <span className="text-sm font-semibold text-teal">Downloads</span>
          <span className="w-11" />
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-[var(--tabbar-clearance)]">
        <div className="rounded-2xl bg-card p-4">
          <p className="text-sm font-semibold text-foreground">{reciterName}</p>
          <p className="mt-1 text-xs text-muted">
            Downloaded surahs play without a connection. Downloads are per reciter; change reciter in Settings.
            {totalBytes() > 0 && <> Using {formatBytes(totalBytes())} on this device.</>}
          </p>
          {juz30Left.length > 0 && (
            <button
              type="button"
              onClick={() => juz30Left.forEach(start)}
              className="tactile-chip mt-3 min-h-11 rounded-full bg-teal px-4 text-xs font-bold text-on-teal"
            >
              Download Juz 30 ({juz30Left.length} surahs)
            </button>
          )}
        </div>

        <SegmentedControl
          options={[{ value: 'all', label: 'All surahs' }, { value: 'downloaded', label: `Downloaded · ${Object.keys(done).length}` }]}
          value={filter}
          onChange={(v) => setFilter(v as 'all' | 'downloaded')}
        />

        {filter === 'downloaded' && shown.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">Nothing downloaded for {reciterName} yet.</p>
        )}

        <ul className="divide-y divide-foreground/5 overflow-hidden rounded-2xl bg-card">
          {shown.map((s) => {
            const d = done[String(s.id)];
            const job = activeJob(reciter, s.id);
            return (
              <li key={s.id} className="flex min-h-14 items-center gap-3 px-4 py-2" data-download={s.id}>
                <span className="w-7 text-xs tabular-nums text-muted">{s.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{s.nameSimple}</span>
                  <span className={cn('block text-xs', failed[s.id] ? 'text-red-500' : 'text-muted')}>
                    {failed[s.id] ?? (job ? `Downloading ${job.done} of ${job.total}…` : d ? `${formatBytes(d.bytes)} · on this device` : `${s.versesCount} ayahs`)}
                  </span>
                </span>
                {job ? (
                  <button type="button" onClick={() => cancelDownload(reciter, s.id)} className="min-h-11 rounded-full px-3 text-xs font-semibold text-muted hover:text-foreground">
                    Cancel
                  </button>
                ) : d ? (
                  <button
                    type="button"
                    onClick={() => void deleteSurah(reciter, s.id, s.versesCount)}
                    aria-label={`Remove ${s.nameSimple} download`}
                    className="min-h-11 rounded-full px-3 text-xs font-semibold text-muted hover:text-red-500"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => start(s)}
                    aria-label={`Download ${s.nameSimple}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-teal hover:bg-teal/10"
                  >
                    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
