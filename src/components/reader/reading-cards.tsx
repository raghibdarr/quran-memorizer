'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from '@/components/app-link';
import { ArrowRightIcon } from '@/components/ui/icons';
import { khatmStatus } from '@/lib/khatm';
import { listenHref, mushafHref } from '@/lib/routes';
import { todayIso } from '@/lib/dates';
import { pageOf, type QuranMeta } from '@/lib/search';
import { useReaderStore } from '@/stores/reader-store';

/** Home: the active khatm's day and today's pages (roadmap #14) */
export function KhatmRow() {
  const khatm = useReaderStore((s) => s.khatm);
  if (!khatm || khatm.endedAt) return null;
  const s = khatmStatus(khatm);
  const line = s.finished
    ? 'complete'
    : s.behind === 0
      ? 'on track today'
      : `pages ${s.today[0]}–${s.today[1]} · ${s.behind} to read`;
  return (
    <Link href="/khatm" className="pressable flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-2.5" data-khatm-row>
      <span className="min-w-0 truncate text-sm">
        <span className="font-semibold text-gold-deep">Khatm · day {s.dayNo} of {khatm.days}</span>
        <span className="text-muted"> · {line}</span>
      </span>
      <ArrowRightIcon size={14} className="shrink-0 text-gold-deep" />
    </Link>
  );
}

const KAHF_KEY = 'kahf-card-dismissed';

const noSubscribe = () => () => {};
/** Friday in local time, and not closed today (false while prerendering) */
function kahfDue(): boolean {
  let dismissed = false;
  try { dismissed = localStorage.getItem(KAHF_KEY) === todayIso(); } catch { /* storage blocked */ }
  return new Date().getDay() === 5 && !dismissed;
}

/** Home on Fridays: the sunnah of reading Surah Al-Kahf (roadmap #14) */
export function KahfCard() {
  const due = useSyncExternalStore(noSubscribe, kahfDue, () => false);
  const [closed, setClosed] = useState(false);
  const show = due && !closed;
  const [page, setPage] = useState<number | null>(null);
  useEffect(() => {
    if (!due) return;
    import('@/data/quran-meta.json').then((m) => {
      setPage(pageOf(m.default as unknown as QuranMeta, 18, 1));
    });
  }, [due]);
  if (!show) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-teal/20 bg-teal/5 px-4 py-2.5" data-kahf-card>
      <Link href={page ? mushafHref(page) : listenHref(18)} className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-teal">It&apos;s Friday</span>
        <span className="text-muted"> · read Surah Al-Kahf</span>
      </Link>
      <button
        type="button"
        onClick={() => { try { localStorage.setItem(KAHF_KEY, todayIso()); } catch { /* ignore */ } setClosed(true); }}
        aria-label="Hide for today"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-foreground"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/** The Hijri month today (Umm al-Qura calendar), or null where the browser lacks it */
export function hijriMonth(date = new Date()): number | null {
  try {
    const m = Number(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).format(date));
    return Number.isFinite(m) ? m : null;
  } catch {
    return null;
  }
}

const isRamadan = () => hijriMonth() === 9;

/** Home in Ramadan, with no khatm running: an invitation to plan one */
export function RamadanKhatmCard() {
  const ramadan = useSyncExternalStore(noSubscribe, isRamadan, () => false);
  const khatm = useReaderStore((s) => s.khatm);
  if (!ramadan || (khatm && !khatm.endedAt)) return null;
  return (
    <Link href="/khatm" className="pressable flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5" data-ramadan-card>
      <span className="min-w-0 truncate text-sm">
        <span className="font-semibold text-gold-deep">Ramadan</span>
        <span className="text-muted"> · plan a khatm of the whole Quran</span>
      </span>
      <ArrowRightIcon size={14} className="shrink-0 text-gold-deep" />
    </Link>
  );
}
