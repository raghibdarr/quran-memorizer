'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import type { Ayah, SurahMeta } from '@/types/quran';
import { getSurah, getSurahIndex } from '@/lib/quran-data';
import { listenHref } from '@/lib/routes';
import BackButton from '@/components/ui/back-button';
import SegmentedControl from '@/components/ui/segmented-control';
import { HIGHLIGHT_CLASS } from '@/components/reader/ayah-menu';
import { cn } from '@/lib/cn';
import { live, parseAyahKey, useReaderStore, type HighlightColor } from '@/stores/reader-store';

type Tab = 'bookmarks' | 'notes' | 'highlights';

interface Entry {
  key: string;
  surah: number;
  ayah: number;
  at: number;
  note?: string;
  color?: HighlightColor;
}

/** Everything marked while reading (roadmap #03), newest first; tap to reopen at the ayah */
export default function BookmarksPage() {
  const bookmarks = useReaderStore((s) => s.bookmarks);
  const notes = useReaderStore((s) => s.notes);
  const highlights = useReaderStore((s) => s.highlights);
  const toggleBookmark = useReaderStore((s) => s.toggleBookmark);
  const [tab, setTab] = useState<Tab>('bookmarks');
  const [surahs, setSurahs] = useState<Map<number, SurahMeta>>(new Map());
  const [texts, setTexts] = useState<Map<string, Ayah>>(new Map());

  const entries = useMemo(() => {
    const toEntry = (key: string, at: number, extra: Partial<Entry>): Entry | null => {
      const ref = parseAyahKey(key);
      return ref ? { key, at, ...ref, ...extra } : null;
    };
    const list =
      tab === 'bookmarks' ? live(bookmarks).map(([k, m]) => toEntry(k, m.at, {}))
      : tab === 'notes' ? live(notes).map(([k, m]) => toEntry(k, m.at, { note: m.text }))
      : live(highlights).map(([k, m]) => toEntry(k, m.at, { color: m.color }));
    return list.filter((e): e is Entry => !!e).sort((a, b) => b.at - a.at);
  }, [tab, bookmarks, notes, highlights]);

  useEffect(() => {
    getSurahIndex().then((idx) => setSurahs(new Map(idx.map((s) => [s.id, s]))));
  }, []);

  // Load the Arabic of the listed ayahs, a surah at a time
  const neededSurahs = useMemo(() => [...new Set(entries.map((e) => e.surah))].join(','), [entries]);
  useEffect(() => {
    let alive = true;
    const ids = neededSurahs ? neededSurahs.split(',').map(Number) : [];
    Promise.all(ids.map((id) => getSurah(id))).then((list) => {
      if (!alive) return;
      const m = new Map<string, Ayah>();
      for (const s of list) for (const a of s.ayahs) m.set(`${s.id}:${a.number}`, a);
      setTexts(m);
    });
    return () => { alive = false; };
  }, [neededSurahs]);

  const counts = { bookmarks: live(bookmarks).length, notes: live(notes).length, highlights: live(highlights).length };

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <BackButton fallback="/" />
          <span className="text-sm font-semibold text-teal">Bookmarks &amp; notes</span>
          <span className="w-11" />
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-[var(--tabbar-clearance)]">
        <SegmentedControl
          options={[
            { value: 'bookmarks', label: `Bookmarks${counts.bookmarks ? ` · ${counts.bookmarks}` : ''}` },
            { value: 'notes', label: `Notes${counts.notes ? ` · ${counts.notes}` : ''}` },
            { value: 'highlights', label: `Highlights${counts.highlights ? ` · ${counts.highlights}` : ''}` },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />

        {entries.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">
            {tab === 'bookmarks' ? 'No bookmarks yet.' : tab === 'notes' ? 'No notes yet.' : 'No highlights yet.'} While reading,
            tap an ayah&apos;s ⋯ to add one.
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => {
              const ayah = texts.get(e.key);
              const name = surahs.get(e.surah)?.nameSimple ?? `Surah ${e.surah}`;
              return (
                <li key={e.key} className={cn('relative rounded-2xl p-4', e.color ? HIGHLIGHT_CLASS[e.color] : 'bg-card')} data-mark={e.key}>
                  <Link href={`${listenHref(e.surah)}&a=${e.ayah}`} className="block">
                    <p className="text-xs font-semibold text-teal">{name} {e.key}</p>
                    {ayah ? (
                      <p dir="rtl" className="arabic-text mt-2 line-clamp-2 text-xl leading-loose text-foreground">{ayah.textUthmani}</p>
                    ) : (
                      <div className="mt-2 h-8 animate-pulse rounded bg-foreground/5" />
                    )}
                    {e.note && <p className="mt-2 line-clamp-4 whitespace-pre-line border-l-2 border-gold/50 pl-3 text-sm text-muted">{e.note}</p>}
                  </Link>
                  {tab === 'bookmarks' && (
                    <button
                      type="button"
                      onClick={() => toggleBookmark(e.key)}
                      aria-label={`Remove bookmark ${e.key}`}
                      className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
