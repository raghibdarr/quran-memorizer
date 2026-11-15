import { Fragment, type ReactNode } from 'react';

const SALLA = 'ﷺ';

/**
 * Text with the ﷺ honorific drawn in the Arabic face at a readable size. In the
 * body font the ligature falls back to a system face and shrinks to a smudge.
 */
export function withHonorific(text: string): ReactNode {
  if (!text.includes(SALLA)) return text;
  const parts = text.split(SALLA);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <span className="arabic-text inline-block align-middle text-[1.25em] leading-none!" lang="ar" dir="rtl" role="img" aria-label="peace and blessings be upon him">
          {SALLA}
        </span>
      )}
    </Fragment>
  ));
}
