'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

const TAJWEED_RULES = [
  { label: 'Silent letter', color: '#AAAAAA' },
  { label: 'Normal madd (2)', color: '#E07DB3' },
  { label: 'Separated madd (2/4/6)', color: '#E67E22' },
  { label: 'Connected madd (4/5)', color: '#DB2777' },
  { label: 'Necessary madd (6)', color: '#E74C3C' },
  { label: "Ghunna/ikhfa'", color: '#2ECC71' },
  { label: 'Qalqala (echo)', color: '#36D7E4' },
];

/**
 * The lesson header's step row, with the tajweed legend's toggle at its end (only in
 * the tajweed script). Sharing the row keeps the header to two lines on a phone.
 */
export default function TajweedLegend({ children }: { children: React.ReactNode }) {
  // Auto-expand ONCE the first time a user sees tajweed script, so the multicolor
  // text is explained rather than mysterious; collapsed thereafter as before.
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('tajweed-legend-seen') == null
  );
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  const tajweed = arabicScript === 'tajweed';

  useEffect(() => {
    if (tajweed && open && localStorage.getItem('tajweed-legend-seen') == null) {
      localStorage.setItem('tajweed-legend-seen', '1');
    }
  }, [tajweed, open]);

  return (
    <>
      {/* equal side columns keep the steps centred */}
      <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
        <span />
        {children}
        {tajweed && (
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? 'Hide tajweed colours' : 'Show tajweed colours'}
            className="pressable flex h-11 w-11 flex-col items-center justify-center gap-1 justify-self-end rounded-full hover:bg-foreground/5"
          >
            <span className="grid grid-cols-2 gap-0.5">
              {TAJWEED_RULES.slice(1, 5).map((rule, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: rule.color }} />
              ))}
            </span>
            <span className="text-[9px] leading-none text-muted">{open ? '▴' : '▾'}</span>
          </button>
        )}
      </div>

      {tajweed && open && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-card p-2.5 shadow-sm border border-foreground/5">
          <p className="col-span-2 mb-0.5 text-[10px] font-semibold text-muted">Tajweed colours</p>
          {TAJWEED_RULES.map((rule, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: rule.color }}
              />
              <span className="text-[10px] text-muted">{rule.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
