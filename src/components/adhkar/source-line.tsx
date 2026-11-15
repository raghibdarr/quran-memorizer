'use client';

import type { Citation } from '@/types/deen';
import { openExternal } from '@/components/deen/citation-line';
import { collectionName, numberingLabel, sunnahComUrl } from '@/components/deen/registry-names';
import { cn } from '@/lib/cn';

function SunnahLink({ citation, url }: { citation: Citation; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => openExternal(url, e)}
      className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap text-xs font-semibold text-teal"
      aria-label={`View ${collectionName(citation.collection)} ${citation.number} on Sunnah.com`}
    >
      Sunnah.com <span aria-hidden>↗</span>
    </a>
  );
}

/**
 * Where an adhkar text comes from (spec 5.1: collection and number, with the
 * numbering scheme named). The deen engine's CitationLine shares one row with
 * the link; at 375px that broke into ragged lines, so this one stacks below sm:
 * collection and number first (the only bold part), the scheme in muted
 * regular weight, the narrator on its own line, the Sunnah.com link last.
 *
 * `compact` is the one quiet line the say-now steps use: "Sahih Muslim 591 ·
 * Thawban", with the scheme kept for screen readers and the full panel a deck away.
 */
export function SourceLine({ citation, compact, className }: { citation: Citation; compact?: boolean; className?: string }) {
  const url = sunnahComUrl(citation);
  const name = `${collectionName(citation.collection)} ${citation.number}`;
  const scheme = numberingLabel(citation.numbering);

  if (compact) {
    return (
      <p className={cn('flex flex-wrap items-baseline gap-x-3 text-xs leading-relaxed text-muted', className)} data-citation>
        <span>
          <span className="font-medium text-foreground/80">{name}</span>
          <span className="sr-only"> ({scheme})</span>
          {citation.narrator && <span> · {citation.narrator}</span>}
        </span>
        {url && <SunnahLink citation={citation} url={url} />}
      </p>
    );
  }

  return (
    <div className={cn('text-[13px] leading-relaxed text-muted', className)} data-citation>
      <p className="flex flex-col sm:block">
        <span>
          <span className="font-semibold text-foreground">{name}</span> <span>({scheme})</span>
          {citation.book && <span>, {citation.book}</span>}
        </span>
        {citation.narrator && (
          <span>
            <span className="hidden sm:inline"> · </span>Narrated by {citation.narrator}
          </span>
        )}
      </p>
      {citation.altNumbers && citation.altNumbers.length > 0 && (
        <p>
          Also numbered{' '}
          {citation.altNumbers.map((a, i) => (
            <span key={`${a.numbering}-${a.number}`}>
              {i > 0 && ', '}
              {a.number} ({numberingLabel(a.numbering)})
            </span>
          ))}
        </p>
      )}
      {url && <SunnahLink citation={citation} url={url} />}
    </div>
  );
}

/**
 * Drops "(Muslim 2726)" from an evidence sentence when the citation above
 * already says it: a parenthesis holding just a name and one of the cited numbers
 */
export function withoutRepeatedCite(text: string, citations: readonly Citation[]): string {
  const numbers = new Set(citations.map((c) => c.number));
  return text.replace(/\s\(([A-Z][\w' -]*?) (\d+[a-z]?)\)/g, (whole, _name: string, n: string) => (numbers.has(n) ? '' : whole));
}

export default SourceLine;
