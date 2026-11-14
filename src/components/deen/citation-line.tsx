'use client';

import type { Citation } from '@/types/deen';
import { isNative } from '@/lib/native';
import { cn } from '@/lib/cn';
import { citationText, collectionName, numberingLabel, sunnahComUrl } from './registry-names';

/** Opens an outside page: the in-app browser on native, a new tab on the web */
export function openExternal(url: string, e?: { preventDefault: () => void }) {
  if (!isNative()) return;
  e?.preventDefault();
  void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url }));
}

/**
 * Where a text comes from, by collection and number with the numbering scheme
 * named (spec 5.1): "Sahih Muslim 2723 (Abd al-Baqi numbering) · narrated by …".
 * The Sunnah.com link is a plain hyperlink out, shown when one is derivable.
 */
export function CitationLine({ citation, className, link = true }: { citation: Citation; className?: string; link?: boolean }) {
  const url = link ? sunnahComUrl(citation) : null;
  return (
    <div className={cn('text-xs leading-relaxed text-muted', className)} data-citation>
      <p>
        <span className="font-semibold text-foreground">{citationText(citation)}</span>
        {citation.book && <span>, {citation.book}</span>}
        {citation.narrator && <span> · narrated by {citation.narrator}</span>}
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
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => openExternal(url, e)}
          className="mt-1 inline-flex min-h-9 items-center gap-1 font-semibold text-teal"
          aria-label={`View ${collectionName(citation.collection)} ${citation.number} on Sunnah.com`}
        >
          View on Sunnah.com <span aria-hidden>↗</span>
        </a>
      )}
    </div>
  );
}

export default CitationLine;
