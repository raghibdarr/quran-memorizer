'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ayah } from '@/types/quran';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { buildAyahWordData } from '@/lib/segments';
import { useSettingsStore } from '@/stores/settings-store';
import { useReviewStore } from '@/stores/review-store';
import { VoiceTracker, mapWordIndex, type TrackerEvent, type VoiceIssue } from '@/lib/voice-tracker';
import Button from '@/components/ui/button';
import { RECITERS, hasWordTimings } from '@/lib/reciters';
import { loadSegmentTimings, type SurahTimings } from '@/lib/segment-audio';
import { ayahDurationMs, paceRatio, paceSentence, reciterProgress } from '@/lib/pace';

type Status = 'loading' | 'ready' | 'listening' | 'finishing' | 'done' | 'error';

/** What the engine flagged in one ayah: words that may be wrong, or the whole ayah */
interface AyahFlags {
  words: number[];
  ayah?: 'skipped' | 'unclear';
}

const WORD_KINDS = new Set(['possible_omission', 'possible_substitution', 'possible_vowel']);

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
  const [flags, setFlags] = useState<Record<number, AyahFlags>>({});
  // The engine's word count per ayah (4 of 6,236 ayahs split one word differently)
  const engineTotals = useRef<Record<number, number>>({});
  const tracker = useRef<VoiceTracker | null>(null);
  // Pace (V5): when the first and the latest words were heard, against the reciter's timings
  const reciter = useSettingsStore((s) => s.reciter);
  const pacedBy = hasWordTimings(reciter) ? reciter : 'Alafasy_128kbps';
  const pacedByName = RECITERS.find((r) => r.id === pacedBy)?.name ?? 'the reciter';
  const [timings, setTimings] = useState<SurahTimings | null>(null);
  const firstHeardAt = useRef<number | null>(null);
  const lastHeardAt = useRef<number | null>(null);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    let live = true;
    loadSegmentTimings(pacedBy, surahId).then((t) => live && setTimings(t));
    return () => { live = false; };
  }, [pacedBy, surahId]);
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
      engineTotals.current[m.ayah] = m.total_words;
      const ours = m.matched_indices.map((i) => mapWordIndex(i, m.total_words, wordCounts[m.ayah]));
      setCurrent(m.ayah);
      setHeard((h) => {
        const merged = Array.from(new Set([...(h[m.ayah] ?? []), ...ours]));
        return merged.length === (h[m.ayah]?.length ?? 0) ? h : { ...h, [m.ayah]: merged };
      });
    };
    const onIssue = (issue: VoiceIssue) => {
      if (issue.surah !== surahId || !(issue.ayah in wordCounts)) return;
      // A skip is flagged because the next ayah was heard where this one belonged;
      // that audio stays credited to the skipped ayah, so count the next one as heard
      const next = issue.ayah + 1;
      if (issue.kind === 'possible_skipped_ayah' && next in wordCounts) {
        setHeard((h) => (h[next]?.length ? h : { ...h, [next]: Array.from({ length: wordCounts[next] }, (_, i) => i) }));
      }
      setFlags((f) => {
        const prev = f[issue.ayah] ?? { words: [] };
        if (issue.kind === 'possible_skipped_ayah' || issue.kind === 'unclear_ayah') {
          return { ...f, [issue.ayah]: { ...prev, ayah: issue.kind === 'unclear_ayah' ? 'unclear' : 'skipped' } };
        }
        if (!WORD_KINDS.has(issue.kind)) return f;
        const total = engineTotals.current[issue.ayah] ?? wordCounts[issue.ayah];
        const w = mapWordIndex(issue.word, total, wordCounts[issue.ayah]);
        return prev.words.includes(w) ? f : { ...f, [issue.ayah]: { ...prev, words: [...prev.words, w] } };
      });
    };
    const first = ayahs[0]?.number ?? 1;
    const last = ayahs[ayahs.length - 1]?.number ?? first;
    const t = new VoiceTracker({
      onLoading: (p) => setProgress(p),
      onReady: () => setStatus((s) => (s === 'loading' ? 'ready' : s)),
      onEvent,
      onIssue,
      onStopped: () => { setStatus('done'); haptic.success(); },
      onError: (message) => { setError(message); setStatus('error'); },
    }, { surah: surahId, ayah: first, ayahEnd: last });
    tracker.current = t;
    return () => t.dispose();
  }, [surahId, wordCounts, ayahs]);

  // Note when words are heard (the pace line and summary measure from these)
  const heardCount = Object.values(heard).reduce((n, w) => n + w.length, 0);
  useEffect(() => {
    if (!heardCount) return;
    const now = Date.now();
    firstHeardAt.current ??= now;
    lastHeardAt.current = now;
  }, [heardCount]);
  // While listening, move the reciter's marker along a few times a second
  useEffect(() => {
    if (status !== 'listening') return;
    const id = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(id);
  }, [status]);

  // Keep the ayah being recited in view
  useEffect(() => {
    if (current == null || status !== 'listening') return;
    document.getElementById(`voice-ayah-${current}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [current, status]);

  const start = async () => {
    firstHeardAt.current = null;
    lastHeardAt.current = null;
    setHeard({});
    setFlags({});
    setCredited(null);
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

  // An ayah flagged as skipped keeps none of the words the engine credited to it
  const heardIn = (n: number) => (flags[n]?.ayah === 'skipped' ? [] : heard[n] ?? []);
  const recitedAyahs = ayahs.filter((a) => heardIn(a.number).length > 0);
  const missedWords = recitedAyahs.reduce((n, a) => n + wordCounts[a.number] - heardIn(a.number).length, 0);
  const skipped = ayahs.filter((a) => flags[a.number]?.ayah === 'skipped').map((a) => a.number);
  const unclear = ayahs.filter((a) => flags[a.number]?.ayah === 'unclear').map((a) => a.number);
  const flaggedWords = Object.values(flags).reduce((n, f) => n + f.words.length, 0);

  // Credit per ayah (roadmap #15: partial credit, and a recitation-verified
  // placement check): between the first and last ayah recited, each one is rated
  // on its own — clean Good, flagged or missing words Shaky, skipped Missed
  const cards = useReviewStore((s) => s.cards);
  const addCard = useReviewStore((s) => s.addCard);
  const reviewCard = useReviewStore((s) => s.reviewCard);
  const [credited, setCredited] = useState<{ reviewed: number; added: number } | null>(null);
  const span = ayahs.filter((a) => heardIn(a.number).length > 0 || skipped.includes(a.number));
  const firstNo = span[0]?.number ?? 0;
  const lastNo = span[span.length - 1]?.number ?? -1;
  const credit = ayahs.filter((a) => a.number >= firstNo && a.number <= lastNo).map((a) => {
    const f = flags[a.number];
    const missing = wordCounts[a.number] - heardIn(a.number).length;
    const quality = f?.ayah === 'skipped' || heardIn(a.number).length === 0 ? 1 : f?.words.length || f?.ayah === 'unclear' || missing > 0 ? 3 : 4;
    return { ayah: a.number, quality };
  });
  const saveCredit = () => {
    const have = new Set(cards.filter((c) => c.surahId === surahId).map((c) => c.ayahNumber));
    let added = 0;
    let reviewed = 0;
    for (const c of credit) {
      if (have.has(c.ayah)) reviewed++;
      else if (c.quality === 1) continue; // a skipped ayah you hadn't memorised isn't one to start tracking
      else { addCard(surahId, c.ayah); added++; }
      reviewCard(surahId, c.ayah, c.quality);
    }
    setCredited({ reviewed, added });
    haptic.success();
  };
  const listening = status === 'listening' || status === 'finishing';

  // Pace: the reciter's time over the passage, and over just what you recited
  const totalWords = ayahs.reduce((n, a) => n + wordCounts[a.number], 0);
  const reciterTotalMs = timings ? ayahs.reduce((n, a) => n + (ayahDurationMs(timings[String(a.number)]) ?? 0), 0) : 0;
  const reciterRecitedMs = timings
    ? recitedAyahs.reduce((n, a) => n + (ayahDurationMs(timings[String(a.number)]) ?? 0) * (heardIn(a.number).length / wordCounts[a.number]), 0)
    : 0;
  const yourMs = firstHeardAt.current && lastHeardAt.current ? lastHeardAt.current - firstHeardAt.current : 0;
  const pace = status === 'done' ? paceSentence(paceRatio(yourMs, reciterRecitedMs), pacedByName) : null;
  const ghost = listening && firstHeardAt.current && reciterTotalMs ? reciterProgress(clock - firstHeardAt.current, reciterTotalMs) : null;

  return (
    <div className="space-y-4">
      {status === 'done' ? (
        <div className="rounded-2xl bg-teal/5 p-4 text-center" data-voice-summary>
          <p className="font-semibold text-teal">
            Heard {recitedAyahs.length} of {ayahs.length} {ayahs.length === 1 ? 'ayah' : 'ayahs'}
          </p>
          <p className="mt-1 text-sm text-muted" data-voice-flags={skipped.length + unclear.length + flaggedWords}>
            {summaryLine({ unheardAyahs: ayahs.length - recitedAyahs.length - skipped.length, missedWords, recited: recitedAyahs.length, skipped, unclear, flaggedWords })}
          </p>
          {pace && <p className="mt-1 text-sm text-muted" data-voice-pace>{pace}</p>}
          {credit.length > 0 && (credited ? (
            <p className="mt-3 text-sm text-foreground" data-voice-credited>
              Saved: {credited.reviewed > 0 && `${credited.reviewed} reviewed`}{credited.reviewed > 0 && credited.added > 0 && ', '}{credited.added > 0 && `${credited.added} added to your reviews`}.
            </p>
          ) : (
            <button type="button" onClick={saveCredit} className="tactile-btn mt-3 min-h-11 w-full rounded-xl bg-teal text-sm font-semibold text-on-teal" data-voice-credit>
              Count this as a review of {credit.length === 1 ? 'this ayah' : `these ${credit.length} ayahs`}
            </button>
          ))}
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

      {ghost !== null && (
        // You (teal) against where the reciter would be by now (gold), through the passage
        <div className="relative mx-1 h-2 rounded-full bg-foreground/[0.07]" role="img" aria-label="Your pace against the reciter's" data-pace-line>
          <span className="absolute inset-y-0 left-0 rounded-full bg-teal/60 transition-[width] duration-300" style={{ width: `${(heardCount / Math.max(1, totalWords)) * 100}%` }} />
          <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-gold transition-[left] duration-300 ease-linear" style={{ left: `${ghost * 100}%` }} />
        </div>
      )}

      <div className="space-y-3">
        {ayahs.map((a) => (
          <VoiceAyah
            key={a.number}
            ayah={a}
            heard={heardIn(a.number)}
            flags={flags[a.number]}
            revealAll={status === 'done'}
            missed={status === 'done' && recitedAyahs.length > 0 && !heardIn(a.number).length}
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

interface Summary {
  unheardAyahs: number;
  missedWords: number;
  recited: number;
  skipped: number[];
  unclear: number[];
  flaggedWords: number;
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const ayahList = (ns: number[]) => (ns.length === 1 ? `Ayah ${ns[0]}` : `Ayahs ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);

function summaryLine({ unheardAyahs, missedWords, recited, skipped, unclear, flaggedWords }: Summary): string {
  if (recited === 0 && !skipped.length) return 'Nothing came through. Try again a little closer to the phone.';
  const out: string[] = [];
  if (skipped.length) out.push(`${ayahList(skipped)} may have been skipped.`);
  const missing = [unheardAyahs > 0 && count(unheardAyahs, 'ayah'), missedWords > 0 && count(missedWords, 'word')].filter(Boolean);
  if (missing.length) out.push(`${missing.join(' and ')} didn't come through, marked below.`);
  if (flaggedWords) out.push(`${flaggedWords === 1 ? 'One word' : `${flaggedWords} words`} sounded different from the text, marked in gold.`);
  if (unclear.length) out.push(`${ayahList(unclear)} ${unclear.length === 1 ? 'was' : 'were'} hard to follow.`);
  if (!out.length) return 'Everything came through.';
  return `${out.join(' ')} It can mishear, so check against the text.`;
}

function VoiceAyah({ ayah, heard, flags, revealAll, active, missed: missedAyah }: { ayah: Ayah; heard: number[]; flags?: AyahFlags; revealAll: boolean; active: boolean; missed: boolean }) {
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
      <div className="mb-1 text-xs text-muted">
        Ayah {ayah.number}
        {missedAyah && !flags?.ayah && <span className="text-red-500"> · didn&apos;t come through</span>}
        {flags?.ayah === 'skipped' && <span className="text-red-500" data-voice-ayah-flag="skipped"> · may have been skipped</span>}
        {flags?.ayah === 'unclear' && <span className="text-gold-deep" data-voice-ayah-flag="unclear"> · hard to follow, check it</span>}
      </div>
      <div dir="rtl" className={cn(base, 'flex flex-wrap justify-center gap-x-2 gap-y-1 text-3xl leading-loose')}>
        {words.map((word, wi) => {
          const isHeard = heard.includes(wi);
          const shown = isHeard || revealAll;
          const missed = revealAll && !isHeard && heard.length > 0;
          const flagged = !!flags?.words.includes(wi);
          const content =
            arabicScript === 'tajweed' && tajweedWords ? (
              <span className="tajweed-text" dangerouslySetInnerHTML={{ __html: tajweedWords[wi] }} />
            ) : arabicScript === 'indopak' && indopakWords ? indopakWords[wi] : word.textUthmani;
          return (
            <span
              key={word.position}
              data-heard={isHeard || undefined}
              data-flagged={flagged || undefined}
              className={cn(
                'rounded-lg px-1 transition-colors duration-200',
                !shown && 'bg-foreground/10',
                missed && 'bg-red-500/10 underline decoration-red-400 decoration-2 underline-offset-8',
                flagged && !missed && 'bg-gold/15 underline decoration-gold decoration-wavy decoration-2 underline-offset-8',
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
