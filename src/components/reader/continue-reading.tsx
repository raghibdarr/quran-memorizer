'use client';

import Link from '@/components/app-link';
import type { SurahMeta } from '@/types/quran';
import { listenHref } from '@/lib/routes';
import { live, useReaderStore } from '@/stores/reader-store';
import { ArrowRightIcon } from '@/components/ui/icons';

/**
 * Home's reading row (roadmap #03): back to the last ayah read, plus the way into
 * bookmarks and notes. Shows nothing until there's something to come back to.
 */
export default function ContinueReading({ surahs }: { surahs: SurahMeta[] }) {
  const lastRead = useReaderStore((s) => s.lastRead);
  const marks = useReaderStore((s) => live(s.bookmarks).length + live(s.notes).length + live(s.highlights).length);
  const surah = lastRead ? surahs.find((s) => s.id === lastRead.surah) : null;
  if (!surah && !marks) return null;

  return (
    <div className="flex gap-2" data-continue-reading>
      {surah && lastRead && (
        <Link
          href={`${listenHref(surah.id)}&a=${lastRead.ayah}`}
          className="pressable flex min-h-12 flex-1 items-center justify-between gap-3 rounded-xl border border-teal/20 bg-teal/5 px-4 py-2.5"
        >
          <span className="min-w-0 truncate text-sm">
            <span className="font-semibold text-teal">Continue reading</span>
            <span className="text-muted"> · {surah.nameSimple} {surah.id}:{lastRead.ayah}</span>
          </span>
          <ArrowRightIcon size={14} className="shrink-0 text-teal" />
        </Link>
      )}
      {marks > 0 && (
        <Link
          href="/bookmarks"
          aria-label={`Bookmarks and notes (${marks})`}
          className="pressable flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border border-gold/30 bg-gold/5 px-3.5 text-sm font-semibold text-gold-deep"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 3h12v18l-6-4-6 4z" /></svg>
          {surah ? marks : `Bookmarks · ${marks}`}
        </Link>
      )}
    </div>
  );
}
