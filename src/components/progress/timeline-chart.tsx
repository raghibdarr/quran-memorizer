'use client';

import { useState, useRef, useCallback } from 'react';
import type { LessonProgress } from '@/types/quran';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  lessons: Record<string, LessonProgress>;
}

export default function TimelineChart({ lessons }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const completions = Object.values(lessons)
    .filter((l) => l.completedAt)
    .map((l) => l.completedAt!)
    .sort((a, b) => a - b);

  // Build cumulative data points (one per day)
  const dayMap = new Map<string, number>();
  completions.forEach((ts, i) => {
    const date = new Date(ts).toISOString().split('T')[0];
    dayMap.set(date, i + 1);
  });

  const points = [...dayMap.entries()].map(([date, count]) => ({
    date,
    ts: new Date(date).getTime(),
    count,
  }));

  if (points.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted">Complete lessons to see your progress over time</p>
      </div>
    );
  }

  const maxCount = points[points.length - 1].count;
  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const tsRange = maxTs - minTs || 86400000;

  // SVG dimensions
  const width = 340;
  const height = 180;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 12;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toX = (ts: number) => padLeft + ((ts - minTs) / tsRange) * plotW;
  const toY = (count: number) => padTop + plotH - (count / maxCount) * plotH;

  const polylinePoints = points.map((p) => `${toX(p.ts)},${toY(p.count)}`).join(' ');
  const areaPoints = `${toX(minTs)},${padTop + plotH} ${polylinePoints} ${toX(maxTs)},${padTop + plotH}`;

  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  };

  const formatDateLong = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Y-axis grid lines
  const yStep = maxCount <= 5 ? 1 : maxCount <= 20 ? 5 : 10;
  const yLines: number[] = [];
  for (let v = 0; v <= maxCount; v += yStep) yLines.push(v);
  if (yLines[yLines.length - 1] !== maxCount) yLines.push(maxCount);

  // X-axis labels — only start and end, skip end if too close
  const xLabels: Array<{ ts: number; label: string; anchor: 'start' | 'middle' | 'end' }> = [];
  if (points.length >= 1) {
    xLabels.push({ ts: minTs, label: formatDate(points[0].date), anchor: 'start' });
  }
  if (points.length > 1) {
    const startX = toX(minTs);
    const endX = toX(maxTs);
    if (endX - startX > 60) {
      xLabels.push({ ts: maxTs, label: formatDate(points[points.length - 1].date), anchor: 'end' });
    }
  }

  // Find nearest point
  const findNearest = useCallback((clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * width;

    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(toX(points[i].ts) - svgX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    return closest;
  }, [points]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    const idx = findNearest(e.clientX);
    if (idx !== null) setSelectedIdx(idx);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // On mouse (non-touch), select on hover without needing to click
    // On touch, only select while dragging
    if (e.pointerType === 'mouse' || isDragging.current) {
      const idx = findNearest(e.clientX);
      if (idx !== null) setSelectedIdx(idx);
    }
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    isDragging.current = false;
    if (e.pointerType === 'mouse') setSelectedIdx(null);
  };

  const selected = selectedIdx !== null ? points[selectedIdx] : null;

  // Compute tooltip position as percentage for the HTML overlay
  const tooltipLeftPct = selected ? ((toX(selected.ts)) / width) * 100 : 0;
  const tooltipTopPct = selected ? ((toY(selected.count)) / height) * 100 : 0;
  // Show tooltip above the dot, or below if too close to top
  const showBelow = selected ? toY(selected.count) < 40 : false;

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-muted">Lessons completed over time</p>
      <div ref={containerRef} className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          {/* Grid lines */}
          {yLines.map((v) => (
            <g key={v}>
              <line
                x1={padLeft}
                y1={toY(v)}
                x2={width - padRight}
                y2={toY(v)}
                stroke="var(--c-muted)"
                strokeOpacity="0.12"
                strokeDasharray="3,3"
              />
              <text x={padLeft - 8} y={toY(v) + 3.5} textAnchor="end" className="fill-muted text-[9px]">
                {v}
              </text>
            </g>
          ))}

          {/* Fill under line */}
          <polygon points={areaPoints} className="fill-teal/10" />

          {/* Line */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="var(--c-teal)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Dots */}
          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={toX(p.ts)}
              cy={toY(p.count)}
              r={i === selectedIdx ? 6 : 4}
              className={i === selectedIdx ? 'fill-gold' : 'fill-teal'}
            />
          ))}

          {/* Selected vertical line */}
          {selected && (
            <line
              x1={toX(selected.ts)}
              y1={padTop}
              x2={toX(selected.ts)}
              y2={padTop + plotH}
              stroke="var(--c-gold)"
              strokeWidth="1"
              strokeDasharray="4,4"
              strokeOpacity="0.5"
            />
          )}

          {/* X axis labels */}
          {xLabels.map((xl, i) => (
            <text
              key={i}
              x={toX(xl.ts)}
              y={height - 8}
              textAnchor={xl.anchor}
              className="fill-muted text-[9px]"
            >
              {xl.label}
            </text>
          ))}
        </svg>

        {/* HTML tooltip — rendered outside SVG so it won't be clipped */}
        {selected && (
          <div
            className={`pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-foreground/10 bg-card px-2.5 py-1.5 shadow-md ${showBelow ? 'mt-3' : '-translate-y-full -mt-3'}`}
            style={{
              left: `clamp(3rem, ${tooltipLeftPct}%, calc(100% - 3rem))`,
              top: `${tooltipTopPct}%`,
            }}
          >
            <p className="whitespace-nowrap text-[10px] font-semibold text-foreground">{formatDateLong(selected.date)}</p>
            <p className="whitespace-nowrap text-[10px] text-teal">{selected.count} lessons completed</p>
          </div>
        )}
      </div>
    </div>
  );
}
