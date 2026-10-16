'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { canRecord, deleteRecording, listRecordings, recordingType, saveRecording, subscribeRecordings, type Recording } from '@/lib/recordings';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';

function fmt(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function when(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Record yourself reciting and listen back (roadmap #12): self-review without a
 * teacher. Recordings stay on this device; the last 10 per surah (or page) are kept.
 */
export default function Recorder({ scope, label, className }: { scope: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'recording' | 'denied'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [list, setList] = useState<Recording[]>([]);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const supported = typeof window !== 'undefined' && canRecord();

  const refresh = useCallback(() => { void listRecordings(scope).then(setList); }, [scope]);
  useEffect(() => { refresh(); return subscribeRecordings(refresh); }, [refresh]);
  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setElapsed(Date.now() - (rec.current?.started ?? Date.now())), 250);
    return () => clearInterval(id);
  }, [state]);
  useEffect(() => () => {
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    audio.current?.pause();
  }, []);

  if (!supported) return null;

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = recordingType();
      const mr = new MediaRecorder(stream, { mimeType: type });
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.start(1000);
      rec.current = { mr, stream, chunks, started: Date.now() };
      setElapsed(0);
      setState('recording');
      haptic.press();
    } catch {
      setState('denied');
    }
  };

  const stop = () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    r.mr.onstop = async () => {
      r.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(r.chunks, { type: r.mr.mimeType || recordingType() });
      if (blob.size > 0) await saveRecording({ scope, label, at: r.started, durationMs: Date.now() - r.started, type: blob.type, blob });
      setOpen(true);
    };
    r.mr.stop();
    setState('idle');
    haptic.success();
  };

  const play = (r: Recording) => {
    audio.current?.pause();
    if (playing === r.id) { setPlaying(null); return; }
    const url = URL.createObjectURL(r.blob);
    const a = new Audio(url);
    a.onended = () => { setPlaying(null); URL.revokeObjectURL(url); };
    audio.current = a;
    void a.play();
    setPlaying(r.id);
  };

  return (
    <div className={cn('rounded-2xl bg-card p-3', className)} data-recorder={scope}>
      <div className="flex items-center gap-3">
        {state === 'recording' ? (
          <button type="button" onClick={stop} className="pressable flex min-h-11 items-center gap-2 rounded-full bg-red-500/15 px-4 text-sm font-semibold text-red-500">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden /> Stop · {fmt(elapsed)}
          </button>
        ) : (
          <button type="button" onClick={start} className="pressable flex min-h-11 items-center gap-2 rounded-full bg-foreground/[0.06] px-4 text-sm font-semibold text-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden /> Record yourself
          </button>
        )}
        {list.length > 0 && state !== 'recording' && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-11 text-xs font-semibold text-teal">
            {open ? 'Hide' : `Your recordings · ${list.length}`}
          </button>
        )}
      </div>
      {state === 'denied' && <p className="mt-2 text-xs text-red-500">Takrar couldn&apos;t use the microphone. Check that it&apos;s allowed.</p>}
      {state === 'idle' && list.length === 0 && <p className="mt-2 text-xs text-muted">Listen back to catch slips a teacher would. It stays on this device.</p>}
      {open && list.length > 0 && (
        <ul className="mt-2 divide-y divide-foreground/5">
          {list.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1.5">
              <button
                type="button"
                onClick={() => play(r)}
                aria-label={playing === r.id ? 'Stop' : `Play recording from ${when(r.at)}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal/10 text-teal"
              >
                {playing === r.id
                  ? <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>
                  : <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M4 2l10 6-10 6V2z" /></svg>}
              </button>
              <span className="min-w-0 flex-1 text-sm text-foreground">{when(r.at)} <span className="text-muted">· {fmt(r.durationMs)}</span></span>
              <button type="button" onClick={() => void deleteRecording(r.id)} className="min-h-9 px-2 text-xs text-muted hover:text-red-500" aria-label="Delete recording">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
