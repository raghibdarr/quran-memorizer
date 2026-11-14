'use client';

import { ChevronDownIcon } from '@/components/ui/icons';

const POSITIONS = [
  {
    title: 'Local sighting',
    text: 'A month begins when the new crescent is seen in your own country or region.',
  },
  {
    title: 'Global sighting',
    text: 'A month begins once a sighting is confirmed anywhere, often by following the announcement of another country.',
  },
  {
    title: 'Calculation',
    text: 'A month begins on a date worked out in advance from astronomy, so the calendar is known ahead of time.',
  },
];

/** Why every date here says "expected": the positions on starting a month, side by side, no winner picked */
export default function SightingExplainer({ engine }: { engine: 'umalqura' | 'tabular' }) {
  return (
    <details className="group rounded-2xl border border-foreground/10 bg-card" data-sighting-explainer>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        Why the dates are expected
        <ChevronDownIcon size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 px-5 pb-5 text-sm leading-relaxed text-muted">
        <p>
          A Hijri month starts with the new moon, and Muslims follow different, long-held positions on how to fix that
          day:
        </p>
        <ul className="space-y-2">
          {POSITIONS.map((p) => (
            <li key={p.title}>
              <span className="font-semibold text-foreground">{p.title}.</span> {p.text}
            </li>
          ))}
        </ul>
        <p>
          The dates here come from {engine === 'umalqura' ? 'the Umm al-Qura calendar' : 'a standard arithmetic Hijri calendar'},
          worked out on your device, so they can differ from your community by a day or two. Follow your local mosque or
          announcement, and use the adjustment above to line the dates up with it.
        </p>
      </div>
    </details>
  );
}
