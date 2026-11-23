'use client';

import { memo, useMemo } from 'react';
import { INTERLINE, LINE_W, MARGIN, PAGE_H, PAGE_W, type PlacedPage } from '@/lib/mushaf-dk/layout';
import { LineKind } from '@/lib/mushaf-dk/text';

interface Props {
  placed: PlacedPage;
  /** Glyph outline (font units, y up) by glyph id */
  glyphPath: (id: number) => string;
  /** Accessible text of the page, one entry per line */
  label?: string;
}

/**
 * One DigitalKhatt Madina page drawn as SVG glyph outlines (prototype). Every
 * line is placed and justified by src/lib/mushaf-dk/layout.ts; this only draws.
 * Words are grouped (<g data-w="s:a:w">) so a full feature can tint, hide or
 * highlight them; ayah markers take the gold ink. Ink is currentColor, so the
 * light and dark themes come from the page's text colour.
 */
function DkPage({ placed, glyphPath, label }: Props) {
  const ids = useMemo(() => {
    const s = new Set<number>();
    for (const l of placed.lines) for (const w of l.words) for (const g of w.glyphs) s.add(g.id);
    return [...s];
  }, [placed]);
  const prefix = `dk${placed.page}-`;

  return (
    <svg
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      className="block h-auto w-full text-foreground"
      role="img"
      aria-label={label}
      data-mushaf-dk-page={placed.page}
    >
      <defs>
        {ids.map((id) => <path key={id} id={prefix + id} d={glyphPath(id)} />)}
      </defs>
      {/* The print's ruled frame */}
      <rect x={MARGIN * 0.35} y={60} width={PAGE_W - MARGIN * 0.7} height={PAGE_H - 120} rx={90} fill="none" className="stroke-gold/60" strokeWidth={22} />
      {placed.lines.map((line, li) => {
        const sx = line.xScale * line.scale;
        return (
          <g key={li} data-line={li + 1}>
            {line.kind === LineKind.Sura && (
              <rect
                x={MARGIN + LINE_W * 0.04}
                y={line.y - INTERLINE * 0.56}
                width={LINE_W * 0.92}
                height={INTERLINE * 0.78}
                rx={INTERLINE * 0.39}
                className="fill-gold/10 stroke-gold"
                strokeWidth={28}
              />
            )}
            <g transform={`translate(${line.right.toFixed(1)} ${line.y.toFixed(1)}) scale(${sx.toFixed(5)} ${(-line.scale).toFixed(5)})`}>
              {line.words.map((w, wi) => (
                <g
                  key={wi}
                  data-w={w.ref ? `${w.ref.surah}:${w.ref.ayah}:${w.ref.word}` : undefined}
                  className={w.ref?.marker || line.kind === LineKind.Sura ? 'text-gold-deep' : undefined}
                  fill="currentColor"
                >
                  {w.glyphs.map((g, gi) => (
                    <use key={gi} href={`#${prefix}${g.id}`} x={g.x} y={g.y} />
                  ))}
                </g>
              ))}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export default memo(DkPage);
