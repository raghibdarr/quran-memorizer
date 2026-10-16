'use client';

import { useEffect, useRef, useState } from 'react';
import type { SurahMeta } from '@/types/quran';
import Link from '@/components/app-link';
import BottomSheet from '@/components/ui/bottom-sheet';
import { listenHref } from '@/lib/routes';
import { getSurah } from '@/lib/quran-data';
import { voiceCheckAvailable, VoiceTracker, type TrackerEvent } from '@/lib/voice-tracker';
import { haptic } from '@/lib/haptics';

type Found = { surah: number; ayah: number; text: string };

/**
 * Recite to find (roadmap #13): say a few words of any ayah and Takrar finds it,
 * on the device, offline. Shown only where the voice model is installed (the app).
 */
export default function VoiceSearch({ surahs }: { surahs: SurahMeta[] }) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'listening' | 'finishing' | 'done' | 'error'>('loading');
  const [found, setFound] = useState<Found[]>([]);
  const tracker = useRef<VoiceTracker | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => { voiceCheckAvailable().then(setAvailable); }, []);
  useEffect(() => () => tracker.current?.dispose(), []);

  const add = (surah: number, ayah: number) => {
    const k = `${surah}:${ayah}`;
    if (seen.current.has(k)) return;
    seen.current.add(k);
    getSurah(surah).then((s) => {
      const a = s.ayahs[ayah - 1];
      if (a) setFound((f) => [...f, { surah, ayah, text: a.textUthmani }]);
    });
    haptic.success();
  };

  const begin = async () => {
    setOpen(true);
    setFound([]);
    seen.current = new Set();
    if (!tracker.current) {
      setState('loading');
      tracker.current = new VoiceTracker({
        onReady: () => setState((s) => (s === 'loading' ? 'ready' : s)),
        onEvent: (e: TrackerEvent) => {
          if (e.type === 'verse_match') {
            const m = e as Extract<TrackerEvent, { type: 'verse_match' }>;
            add(m.surah, m.ayah);
          } else if (e.type === 'final_sequence') {
            for (const v of (e as { verses?: { surah: number; ayah: number }[] }).verses ?? []) add(v.surah, v.ayah);
          }
        },
        onStopped: () => setState('done'),
        onError: () => setState('error'),
      }, null, 'tracking');
    } else {
      setState('ready');
    }
  };

  const listen = async () => {
    try {
      await tracker.current?.start();
      setState('listening');
    } catch {
      setState('error');
    }
  };
  const stop = () => { setState('finishing'); void tracker.current?.stop(); };
  const close = () => { if (state === 'listening') void tracker.current?.stop(); setOpen(false); };

  if (!available) return null;
  const name = (id: number) => surahs.find((s) => s.id === id)?.nameSimple ?? `Surah ${id}`;

  return (
    <>
      <button
        type="button"
        onClick={() => void begin()}
        aria-label="Recite to find an ayah"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-foreground/15 bg-card text-teal"
        data-voice-search
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="17" x2="12" y2="22" />
        </svg>
      </button>
      <BottomSheet open={open} onClose={close} title="Recite to find" doneButton>
        <div className="space-y-4 pb-2">
          <p className="text-sm text-muted">Recite a few words of any ayah and Takrar will find it. It all happens on your phone.</p>
          {state === 'loading' && <p className="text-sm text-muted">Getting ready…</p>}
          {state === 'error' && <p className="text-sm text-red-500">Takrar couldn&apos;t use the microphone. Check that it&apos;s allowed.</p>}
          {found.length > 0 && (
            <ul className="space-y-2">
              {found.map((f) => (
                <li key={`${f.surah}:${f.ayah}`}>
                  <Link href={`${listenHref(f.surah)}&a=${f.ayah}`} className="block rounded-xl bg-foreground/[0.04] px-4 py-3" onClick={close}>
                    <p className="text-xs font-semibold text-teal">{name(f.surah)} {f.surah}:{f.ayah}</p>
                    <p dir="rtl" className="arabic-text mt-1 line-clamp-2 text-xl leading-loose text-foreground">{f.text}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {state === 'done' && found.length === 0 && <p className="text-sm text-muted">Couldn&apos;t place that. Try a few more words, a little closer to the phone.</p>}
          {state === 'listening' || state === 'finishing' ? (
            <button type="button" onClick={stop} disabled={state === 'finishing'} className="tactile-btn flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal text-sm font-semibold text-on-teal">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" aria-hidden />
              {state === 'finishing' ? 'Finishing…' : found.length ? 'Done' : 'Listening… tap when done'}
            </button>
          ) : (
            <button type="button" onClick={() => void listen()} disabled={state === 'loading' || state === 'error'} className="tactile-btn min-h-12 w-full rounded-xl bg-teal text-sm font-semibold text-on-teal disabled:opacity-50">
              {state === 'done' ? 'Try again' : 'Start reciting'}
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
