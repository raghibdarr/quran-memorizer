'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ayah } from '@/types/quran';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { buildAyahWordData } from '@/lib/segments';
import { useSettingsStore } from '@/stores/settings-store';
import { VoiceTracker, mapWordIndex, type TrackerEvent } from '@/lib/voice-tracker';
import Button from '@/components/ui/button';

type Status = 'loading' | 'ready' | 'listening' | 'finishing' | 'done' | 'error';

interface VoiceReciteProps {
  surahId: number;
  ayahs: Ayah[];
  onExit: () => void;
}

/**
 * Voice check (beta): recite from memory and each word appears as the on-device
 * model hears it. Tilawa by Quran Lab; its model licence (NPL-1.2) means this stays
 * free for everyone, always.
 */
export default function VoiceRecite({ surahId, ayahs, onExit }: VoiceReciteProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  // ayah number → heard word indices (ours)
  const [heard, setHeard] = useState<Record<number, number[]>>({});
  const [current, setCurrent] = useState<number | null>(null);
  const tracker = useRef<VoiceTracker | null>(null);
  const wordCounts = useMemo(
    () => Object.fromEntries(ayahs.map((a) => [a.number, a.words.filter((w) => w.charType === 'word').length])),
    [ayahs],
  );

  useEffect(() => {
    const onEvent = (e: TrackerEvent) => {
      // A verse match is the engine's firm signal; word progress (0.2.x) often lags or
      // skips words in an ayah it went on to match, so a match fills the whole ayah
      if (e.type === 'verse_match') {
        const m = e as Extract<TrackerEvent, { type: 'verse_match' }>;
        if (m.surah !== surahId || !(m.ayah in wordCounts)) return;
        setCurrent(m.ayah);
        setHeard((h) => ({ ...h, [m.ayah]: Array.from({ length: wordCounts[m.ayah] }, (_, i) => i) }));
        return;
      }
      if (e.type !== 'word_progress') return;
      const m = e as Extract<TrackerEvent, { type: 'word_progress' }>;
      if (m.surah !== surahId || !(m.ayah in wordCounts)) return;
      const ours = m.matched_indices.map((i) => mapWordIndex(i, m.total_words, wordCounts[m.ayah]));
      setCurrent(m.ayah);
      setHeard((h) => {
        const merged = Array.from(new Set([...(h[m.ayah] ?? []), ...ours]));
        return merged.length === (h[m.ayah]?.length ?? 0) ? h : { ...h, [m.ayah]: merged };
      });
    };
    const t = new VoiceTracker({
      onLoading: (p) => setProgress(p),
      onReady: () => setStatus((s) => (s === 'loading' ? 'ready' : s)),
      onEvent,
      onStopped: () => { setStatus('done'); haptic.success(); },
      onError: (message) => { setError(message); setStatus('error'); },
    });
    tracker.current = t;
    return () => t.dispose();
  }, [surahId, wordCounts]);

  // Keep the ayah being recited in view
  useEffect(() => {
    if (current == null || status !== 'listening') return;
    document.getElementById(`voice-ayah-${current}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [current, status]);

  const start = async () => {
    setHeard({});
    setCurrent(null);
    try {
      await tracker.current?.start();
      setStatus('listening');
    } catch {
      setError("Takrar couldn't use the microphone. Check that microphone access is allowed for the app.");
      setStatus('error');
    }
  };

  const stop = () => {
    setStatus('finishing');
    void tracker.current?.stop();
  };

  const recitedAyahs = ayahs.filter((a) => (heard[a.number]?.length ?? 0) > 0);
  const missedWords = recitedAyahs.reduce((n, a) => n + wordCounts[a.number] - heard[a.number].length, 0);
  const listening = status === 'listening' || status === 'finishing';

  return (
    <div className="space-y-4">
      {status === 'done' ? (
        <div className="rounded-2xl bg-teal/5 p-4 text-center" data-voice-summary>
          <p className="font-semibold text-teal">
            Heard {recitedAyahs.length} of {ayahs.length} {ayahs.length === 1 ? 'ayah' : 'ayahs'}
          </p>
          <p className="mt-1 text-sm text-muted">{summaryLine(ayahs.length - recitedAyahs.length, missedWords, recitedAyahs.length)}</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-gold/10 p-4 text-sm text-foreground">
          <p className="font-semibold">Voice check <span className="ml-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs text-gold-deep">beta</span></p>
          <p className="mt-1 text-muted">
            Recite from memory. Each word shows up once Takrar hears it. It all runs on your phone, so your voice never leaves it.
          </p>
          {status === 'loading' && <p className="mt-2 text-xs text-muted">Getting ready… {progress}%</p>}
          {status === 'error' && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      )}

      <div className="space-y-3">
        {ayahs.map((a) => (
          <VoiceAyah
            key={a.number}
            ayah={a}
            heard={heard[a.number] ?? []}
            revealAll={status === 'done'}
            missed={status === 'done' && recitedAyahs.length > 0 && !heard[a.number]?.length}
            active={listening && current === a.number}
          />
        ))}
      </div>

      <p className="text-center text-xs text-muted">
        Speech recognition by Tilawa from Quran Lab, free for everyone.
      </p>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-2 bg-cream/95 px-4 pt-2 backdrop-blur-sm" style={{ paddingBottom: 'var(--tabbar-clearance)' }}>
        {listening ? (
          <Button className="flex w-full items-center justify-center gap-2" onClick={stop} disabled={status === 'finishing'}>
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" aria-hidden />
            {status === 'finishing' ? 'Finishing…' : "Stop, I'm done"}
          </Button>
        ) : (
          <Button className="w-full" onClick={start} disabled={status === 'loading' || status === 'error'}>
            {status === 'done' ? 'Recite again' : status === 'loading' ? 'Getting ready…' : 'Start reciting'}
          </Button>
        )}
        <Button variant="ghost" className="w-full" onClick={onExit} disabled={listening}>
          Back to reciting without voice
        </Button>
      </div>
    </div>
  );
}

function summaryLine(unheardAyahs: number, missedWords: number, recited: number): string {
  if (recited === 0) return 'Nothing came through. Try again a little closer to the phone.';
  const parts: string[] = [];
  if (unheardAyahs) parts.push(`${unheardAyahs} ${unheardAyahs === 1 ? 'ayah' : 'ayahs'}`);
  if (missedWords) parts.push(`${missedWords} ${missedWords === 1 ? 'word' : 'words'}`);
  if (!parts.length) return 'Everything came through.';
  return `${parts.join(' and ')} didn't come through, marked below. It can mishear, so check them against the text.`;
}

function VoiceAyah({ ayah, heard, revealAll, active, missed: missedAyah }: { ayah: Ayah; heard: number[]; revealAll: boolean; active: boolean; missed: boolean }) {
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  const { tajweedWords, indopakWords } = useMemo(() => buildAyahWordData(ayah), [ayah]);
  const words = ayah.words.filter((w) => w.charType === 'word');
  const base = arabicScript === 'indopak' && indopakWords ? 'arabic-text-indopak' : 'arabic-text';

  return (
    <div
      id={`voice-ayah-${ayah.number}`}
      data-voice-ayah={ayah.number}
      data-voice-missed={missedAyah || undefined}
      className={cn('rounded-2xl border p-3 transition-colors', active ? 'border-gold/60 bg-gold/5' : missedAyah ? 'border-red-400/40 bg-red-500/5' : 'border-foreground/5')}
    >
      <div className="mb-1 text-xs text-muted">Ayah {ayah.number}{missedAyah && <span className="text-red-500"> · didn&apos;t come through</span>}</div>
      <div dir="rtl" className={cn(base, 'flex flex-wrap justify-center gap-x-2 gap-y-1 text-3xl leading-loose')}>
        {words.map((word, wi) => {
          const isHeard = heard.includes(wi);
          const shown = isHeard || revealAll;
          const missed = revealAll && !isHeard && heard.length > 0;
          const content =
            arabicScript === 'tajweed' && tajweedWords ? (
              <span className="tajweed-text" dangerouslySetInnerHTML={{ __html: tajweedWords[wi] }} />
            ) : arabicScript === 'indopak' && indopakWords ? indopakWords[wi] : word.textUthmani;
          return (
            <span
              key={word.position}
              data-heard={isHeard || undefined}
              className={cn(
                'rounded-lg px-1 transition-colors duration-200',
                !shown && 'bg-foreground/10',
                missed && 'bg-red-500/10 underline decoration-red-400 decoration-2 underline-offset-8',
              )}
            >
              <span className={cn('transition-opacity duration-200', !shown && 'opacity-0')}>{content}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
