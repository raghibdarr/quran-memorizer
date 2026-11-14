'use client';

import Card from '@/components/ui/card';
import { useReducedMotion } from './use-reduced-motion';

const FIGURE_8 =
  'M28 16c-5-7-9-11-15-11C7 5 4 10 4 16s3 11 9 11c6 0 10-4 15-11s9-11 15-11c6 0 9 5 9 11s-3 11-9 11c-6 0-10-4-15-11Z';

/** Shown while the compass is unsteady: the figure-8 wave that recalibrates a phone's magnetometer */
export default function CalibrationHint() {
  const reduce = useReducedMotion();
  return (
    <div data-calibration-hint>
      <Card className="flex items-center gap-3 p-4">
        <svg width={56} height={32} viewBox="0 0 56 32" fill="none" className="shrink-0 text-teal" aria-hidden>
          <path
            d={FIGURE_8}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="4 4"
          />
          {/* A dot tracing the 8; with reduced motion it rests at the crossing */}
          {reduce ? (
            <circle cx={28} cy={16} r={3.5} className="fill-gold" />
          ) : (
            <circle r={3.5} className="fill-gold">
              <animateMotion dur="3s" repeatCount="indefinite" path={FIGURE_8} />
            </circle>
          )}
        </svg>
        <div className="min-w-0 text-sm leading-relaxed" role="status">
          <p className="font-medium text-foreground">The compass is unsteady</p>
          <p className="text-muted">Wave your phone in a figure 8 a few times, away from metal and magnets.</p>
        </div>
      </Card>
    </div>
  );
}
