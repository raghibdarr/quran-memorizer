'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MushafPage, MushafWord } from '@/lib/mushaf';
import { ayahsOnPage } from '@/lib/mushaf';
import { mapWordIndex, voiceCheckAvailable, VoiceTracker, type TrackerEvent } from '@/lib/voice-tracker';
import { useReviewStore } from '@/stores/review-store';
import BottomSheet from '@/components/ui/bottom-sheet';
import Button from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import type { WordMark } from './mushaf-page';
import Recorder from '@/components/practice/recorder';

export type RecallMode = 'read' | 'hide' | 'hint';

const key = (s: number, a: number, w: number) => `${s}:${a}:${w}`;
/** Peeking at this share of an ayah's words or more counts it as missed */
const MISSED_SHARE = 0.3;

/**
 * Page-based recall (roadmap #08): recite a mushaf page from memory with its words
 * hidden (or down to first letters) in place, so the page keeps its shape. Tap a
 * word, or "Next word", to peek; in the app, the voice check reveals words as it
 * hears them. Peeks are remembered per ayah and suggest the rating at the end
 * (roadmap #12: a peek is a sign of weakness), which feeds that ayah's reviews.
 */
export function usePageRecall(page: MushafPage | null) {
  const [mode, setModeState] = useState<RecallMode>('read');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [heard, setHeard] = useState<Set<string>>(new Set());
  const [peeks, setPeeks] = useState<Record<string, number>>({});

  // Reading order of the page's words (markers and titles excluded)
  const words = useMemo(
    () => (page ? page.lines.flatMap((l) => l.words).filter((w) => w.kind === 'word' && w.ayah !== null) : []),
    [page],
  );

  // A new page starts fresh
  const pageNo = page?.page ?? 0;
  const [lastPage, setLastPage] = useState(pageNo);
  if (lastPage !== pageNo) {
    setLastPage(pageNo);
    setRevealed(new Set());
    setHeard(new Set());
    setPeeks({});
  }

  const isShown = useCallback(
    (w: MushafWord) => revealed.has(key(w.surah, w.ayah!, w.wordNo)) || heard.has(key(w.surah, w.ayah!, w.wordNo)),
    [revealed, heard],
  );

  // Peeks are checked against what's been revealed this instant, not the last render
  // (two quick taps must not count one word twice)
  const shownNow = useRef(new Set<string>());
  useEffect(() => { shownNow.current = new Set([...revealed, ...heard]); }, [revealed, heard]);
  const peek = useCallback((list: MushafWord[]) => {
    const fresh = list.filter((w) => w.kind === 'word' && w.ayah !== null && !shownNow.current.has(key(w.surah, w.ayah, w.wordNo)));
    if (!fresh.length) return;
    for (const w of fresh) shownNow.current.add(key(w.surah, w.ayah!, w.wordNo));
    setRevealed((r) => { const n = new Set(r); for (const w of fresh) n.add(key(w.surah, w.ayah!, w.wordNo)); return n; });
    setPeeks((p) => {
      const n = { ...p };
      for (const w of fresh) n[`${w.surah}:${w.ayah}`] = (n[`${w.surah}:${w.ayah}`] ?? 0) + 1;
      return n;
    });
    haptic.selection();
  }, []);

  const nextHidden = words.find((w) => !isShown(w)) ?? null;
  const firstHidden = () => words.find((w) => !shownNow.current.has(key(w.surah, w.ayah!, w.wordNo))) ?? null;
  const nextWord = () => { const w = firstHidden(); if (w) peek([w]); };
  const showAyah = () => { const w = firstHidden(); if (w) peek(words.filter((x) => x.surah === w.surah && x.ayah === w.ayah)); };
  const showAll = () => peek(words);

  const markFor = useCallback((w: MushafWord): WordMark => {
    if (mode === 'read' || w.kind !== 'word' || w.ayah === null) return null;
    if (heard.has(key(w.surah, w.ayah, w.wordNo))) return 'playing';
    if (revealed.has(key(w.surah, w.ayah, w.wordNo))) return 'flag';
    return mode === 'hide' ? 'hidden' : 'hint';
  }, [mode, heard, revealed]);

  const setMode = (m: RecallMode) => {
    setModeState(m);
    setRevealed(new Set());
    setHeard(new Set());
    setPeeks({});
  };

  /** Voice: words the engine heard count as recited, not peeked */
  const onHeard = useCallback((surah: number, ayah: number, engineIdx: number[], engineTotal: number) => {
    const inAyah = words.filter((w) => w.surah === surah && w.ayah === ayah);
    if (!inAyah.length) return;
    setHeard((h) => {
      const n = new Set(h);
      for (const i of engineIdx) {
        const w = inAyah[mapWordIndex(i, engineTotal, inAyah.length)];
        if (w) n.add(key(surah, ayah, w.wordNo));
      }
      return n.size === h.size ? h : n;
    });
  }, [words]);
  const onAyahHeard = useCallback((surah: number, ayah: number) => {
    setHeard((h) => {
      const n = new Set(h);
      for (const w of words) if (w.surah === surah && w.ayah === ayah) n.add(key(surah, ayah, w.wordNo));
      return n;
    });
  }, [words]);

  const ayahs = useMemo(() => (page ? ayahsOnPage(page) : []), [page]);
  /** Suggested rating per ayah from the peeks: 5 none, 3 a few, 1 many */
  const suggested = useMemo(() => ayahs.map(({ surah, ayah }) => {
    const total = words.filter((w) => w.surah === surah && w.ayah === ayah).length || 1;
    const n = peeks[`${surah}:${ayah}`] ?? 0;
    return { surah, ayah, peeked: n, quality: n === 0 ? 5 : n / total >= MISSED_SHARE ? 1 : 3 };
  }), [ayahs, words, peeks]);

  return { mode, setMode, markFor, peek, nextWord, showAyah, showAll, nextHidden, suggested, onHeard, onAyahHeard, done: !nextHidden };
}

type Recall = ReturnType<typeof usePageRecall>;

/** The recall toolbar under the page, and the end-of-page rating sheet */
export function RecallBar({ recall, passage, pageNo }: { recall: Recall; passage: { surah: number; ayah: number; ayahEnd: number } | null; pageNo: number }) {
  const [rating, setRating] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const cards = useReviewStore((s) => s.cards);
  const reviewCard = useReviewStore((s) => s.reviewCard);
  const [voice, setVoice] = useState<'off' | 'loading' | 'listening'>('off');
  const [voiceOk, setVoiceOk] = useState(false);
  const tracker = useRef<VoiceTracker | null>(null);

  useEffect(() => { voiceCheckAvailable().then(setVoiceOk); }, []);
  useEffect(() => () => tracker.current?.dispose(), []);

  const startVoice = async () => {
    if (!tracker.current) {
      setVoice('loading');
      const t = new VoiceTracker({
        onEvent: (e: TrackerEvent) => {
          if (e.type === 'verse_match') { const m = e as Extract<TrackerEvent, { type: 'verse_match' }>; recall.onAyahHeard(m.surah, m.ayah); }
          if (e.type === 'word_progress') { const m = e as Extract<TrackerEvent, { type: 'word_progress' }>; recall.onHeard(m.surah, m.ayah, m.matched_indices, m.total_words); }
        },
        onReady: () => setVoice((v) => (v === 'loading' ? 'off' : v)),
        onError: () => setVoice('off'),
      }, passage);
      tracker.current = t;
    }
    try {
      await tracker.current.start();
      setVoice('listening');
    } catch {
      setVoice('off');
    }
  };
  const stopVoice = () => { void tracker.current?.stop(); setVoice('off'); };

  const known = new Set(cards.map((c) => `${c.surahId}:${c.ayahNumber}`));
  const rated = recall.suggested.filter((s) => known.has(`${s.surah}:${s.ayah}`));
  const save = () => {
    for (const r of rated) reviewCard(r.surah, r.ayah, r.quality);
    setSaved(rated.length);
    haptic.success();
  };

  if (recall.mode === 'read') return null;
  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2" data-recall-bar>
        <button type="button" onClick={recall.nextWord} disabled={recall.done} className="pressable min-h-10 rounded-full bg-foreground/[0.06] px-3 text-xs font-semibold text-foreground disabled:opacity-40">Next word</button>
        <button type="button" onClick={recall.showAyah} disabled={recall.done} className="pressable min-h-10 rounded-full bg-foreground/[0.06] px-3 text-xs font-semibold text-foreground disabled:opacity-40">Show ayah</button>
        {voiceOk && (
          <button
            type="button"
            onClick={voice === 'listening' ? stopVoice : startVoice}
            disabled={voice === 'loading'}
            className={cn('pressable min-h-10 rounded-full px-3 text-xs font-semibold', voice === 'listening' ? 'bg-red-500/15 text-red-500' : 'bg-teal/10 text-teal')}
          >
            {voice === 'listening' ? 'Stop listening' : voice === 'loading' ? 'Getting ready…' : 'Recite aloud'}
          </button>
        )}
        <button type="button" onClick={() => { stopVoice(); setSaved(null); setRating(true); }} className="pressable min-h-10 rounded-full bg-teal px-3 text-xs font-semibold text-on-teal">Done</button>
      </div>
      <Recorder scope={`page:${pageNo}`} label={`Page ${pageNo}`} className="mt-2" />
      <BottomSheet open={rating} onClose={() => setRating(false)} title="How did this page go?" doneButton>
        <div className="space-y-3 pb-2">
          {saved !== null ? (
            <p className="text-sm text-foreground">{saved ? `Saved to ${saved} ${saved === 1 ? 'ayah' : 'ayahs'}' reviews.` : 'None of these ayahs are in your reviews yet, so nothing was saved.'}</p>
          ) : (
            <>
              <p className="text-sm text-muted">From what you peeked at. Ayahs you&apos;ve memorised update their reviews.</p>
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {recall.suggested.map((s) => (
                  <li key={`${s.surah}:${s.ayah}`} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{s.surah}:{s.ayah}{!known.has(`${s.surah}:${s.ayah}`) && <span className="text-muted"> · not in reviews</span>}</span>
                    <span className={cn('font-semibold', s.quality === 5 ? 'text-success' : s.quality === 3 ? 'text-gold-deep' : 'text-miss')}>
                      {s.quality === 5 ? 'Got it' : s.quality === 3 ? `Shaky · ${s.peeked} peek${s.peeked === 1 ? '' : 's'}` : `Missed · ${s.peeked} peeks`}
                    </span>
                  </li>
                ))}
              </ul>
              <Button className="w-full" onClick={save} disabled={!rated.length}>{rated.length ? 'Save to my reviews' : 'Nothing here is in your reviews'}</Button>
            </>
          )}
          <button type="button" onClick={() => { setRating(false); recall.showAll(); }} className="min-h-11 w-full text-sm font-semibold text-muted">Show the whole page</button>
        </div>
      </BottomSheet>
    </>
  );
}
