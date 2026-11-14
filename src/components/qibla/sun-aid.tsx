'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/ui/card';
import { sunAid, sunPosition, type SunAid as SunAidResult } from '@/lib/qibla/sun';

/** A plain sun, local to the qibla screen */
export function SunIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </svg>
  );
}

export function sunAidText(aid: SunAidResult): { line: string; how?: string } | null {
  switch (aid.kind) {
    case 'below':
      return null;
    case 'overhead':
      return { line: 'The sun is nearly overhead, so it can’t show a direction right now.' };
    case 'ahead':
      return { line: 'The sun is now in line with the qibla.', how: 'Face the sun and you are facing the qibla.' };
    case 'behind':
      return { line: 'The sun is now directly behind the qibla.', how: 'Stand with the sun at your back and you are facing the qibla.' };
    case 'side':
      return {
        line: `The sun is now ${aid.degrees}° to the ${aid.side} of the qibla.`,
        how: `Face the sun, then turn ${aid.degrees}° to your ${aid.side === 'right' ? 'left' : 'right'}.`,
      };
  }
}

/**
 * "The sun is now N° to the left/right of the qibla", worked out on the device
 * from the time and the saved place. Hidden while the sun is below the horizon.
 */
export default function SunAid({ lat, lng, bearing }: { lat: number; lng: number; bearing: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const text = sunAidText(sunAid(bearing, sunPosition(now, lat, lng)));
  if (!text) return null;
  return (
    <div data-sun-aid>
      <Card className="flex items-start gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
          <SunIcon size={20} />
        </span>
        <div className="min-w-0 text-sm leading-relaxed">
          <p className="font-medium text-foreground">{text.line}</p>
          {text.how && <p className="text-muted">{text.how}</p>}
        </div>
      </Card>
    </div>
  );
}
