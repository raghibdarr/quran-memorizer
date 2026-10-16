'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import type { SurahMeta } from '@/types/quran';
import { listenHref, mushafHref } from '@/lib/routes';
import { parseJump, searchAyahs, isArabicQuery, type AyahHit, type QuranMeta, type SearchIndex } from '@/lib/search';
import { ArrowRightIcon } from '@/components/ui/icons';

type Loaded = { index: SearchIndex; meta: QuranMeta };
let loading: Promise<Loaded> | null = null;
/** The index is 1.7 MB, so it loads on the first search, not with Home */
function loadIndex(): Promise<Loaded> {
  loading ??= Promise.all([import('@/data/search-index.json'), import('@/data/quran-meta.json')]).then(
    ([i, m]) => ({ index: i.default as unknown as SearchIndex, meta: m.default as unknown as QuranMeta }),
  );
  return loading;
}

const PAGE = 30;

/**
 * Ayah search and jumps under Home's search box (roadmap #04): "2:255", "page 50",
 * "juz 30", Arabic words with or without harakat, or English from the translation.
 * Works offline. Reports how many ayahs matched so Home can word its empty state.
 */
export default function AyahSearch({ query, surahs, onCount }: { query: string; surahs: SurahMeta[]; onCount?: (n: number) => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [debounced, setDebounced] = useState(query);
  const [shown, setShown] = useState(PAGE);
  const q = query.trim();

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setShown(PAGE); }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const wants = q.length >= 2 && (isArabicQuery(q) || /[a-z]{3}|\d\s*[:.\s]\s*\d|^(page|pg|p|juz|para|j)\s*\d/i.test(q));
  useEffect(() => {
    if (wants && !data) loadIndex().then(setData).catch(() => {});
  }, [wants, data]);

  const names = useMemo(() => new Map(surahs.map((s) => [s.id, s.nameSimple])), [surahs]);
  const jump = data && debounced ? parseJump(debounced, data.index.counts, data.meta) : null;
  const result = useMemo(
    () => (data && debounced && !parseJump(debounced, data.index.counts, data.meta) ? searchAyahs(data.index, debounced, 200) : { hits: [], total: 0 }),
    [data, debounced],
  );

  useEffect(() => { onCount?.(result.total + (jump ? 1 : 0)); }, [result.total, jump, onCount]);

  if (!wants) return null;
  if (!data) return <p className="py-3 text-center text-xs text-muted" role="status">Searching the Quran…</p>;
  if (!jump && result.total === 0) return null;

  return (
    <section className="mb-4 space-y-2" aria-label="Ayahs" data-ayah-search>
      {jump && (
        <Link href={jump.kind === 'page' ? mushafHref(jump.page) : `${listenHref(jump.surah)}&a=${jump.ayah}`} className="pressable flex min-h-14 items-center justify-between gap-3 rounded-xl bg-teal px-4 py-3 text-on-teal">
          <span className="text-sm font-semibold">
            {jump.kind === 'ayah' && `Go to ${names.get(jump.surah) ?? 'Surah'} ${jump.surah}:${jump.ayah}`}
            {jump.kind === 'page' && `Go to page ${jump.page} · ${names.get(jump.surah) ?? ''} ${jump.surah}:${jump.ayah}`}
            {jump.kind === 'juz' && `Go to juz ${jump.juz} · ${names.get(jump.surah) ?? ''} ${jump.surah}:${jump.ayah}`}
          </span>
          <ArrowRightIcon size={16} className="shrink-0" />
        </Link>
      )}
      {result.total > 0 && (
        <>
          <p className="px-1 text-xs font-semibold text-muted">
            {result.total === 1 ? '1 ayah' : `${result.total.toLocaleString()} ayahs`}
            {result.total > 200 && ' · showing the first 200'}
          </p>
          <ul className="space-y-2">
            {result.hits.slice(0, shown).map((h) => (
              <li key={`${h.surah}:${h.ayah}`}>
                <Link href={`${listenHref(h.surah)}&a=${h.ayah}`} className="block rounded-xl bg-card px-4 py-3 hover:bg-foreground/[0.03]">
                  <p className="text-xs font-semibold text-teal">{names.get(h.surah) ?? `Surah ${h.surah}`} {h.surah}:{h.ayah}</p>
                  <HitText hit={h} />
                </Link>
              </li>
            ))}
          </ul>
          {shown < result.hits.length && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="min-h-11 w-full rounded-xl text-sm font-semibold text-teal">
              Show more
            </button>
          )}
        </>
      )}
    </section>
  );
}

function HitText({ hit }: { hit: AyahHit }) {
  const arabic = hit.field === 'arabic';
  // Long ayahs: show a window around the first match
  let start = 0;
  let end = hit.text.length;
  const first = hit.ranges[0];
  const window = arabic ? 140 : 220;
  if (first && hit.text.length > window) {
    start = Math.max(0, first[0] - Math.floor(window / 3));
    end = Math.min(hit.text.length, start + window);
  }
  const parts: React.ReactNode[] = [];
  let at = start;
  for (const [a, b] of hit.ranges) {
    if (b <= start || a >= end) continue;
    if (a > at) parts.push(hit.text.slice(at, a));
    parts.push(<mark key={a} className="rounded bg-gold/30 px-0.5 text-inherit">{hit.text.slice(Math.max(a, at), Math.min(b, end))}</mark>);
    at = Math.min(b, end);
  }
  if (at < end) parts.push(hit.text.slice(at, end));
  return (
    <p dir={arabic ? 'rtl' : 'ltr'} className={arabic ? 'arabic-text mt-1 text-xl leading-loose text-foreground' : 'mt-1 text-sm text-foreground/90'}>
      {start > 0 && '…'}{parts}{end < hit.text.length && '…'}
    </p>
  );
}
