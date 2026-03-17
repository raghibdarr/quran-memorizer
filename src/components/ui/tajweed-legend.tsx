'use client';

import { useState } from 'react';
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

export default function TajweedLegend() {
  const [open, setOpen] = useState(false);
  const arabicScript = useSettingsStore((s) => s.arabicScript);

  if (arabicScript !== 'tajweed') return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
      >
        <div className="flex gap-0.5">
          {TAJWEED_RULES.slice(0, 5).map((rule, i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: rule.color }}
            />
          ))}
        </div>
        <span>Tajweed colors {open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-card p-2.5 shadow-sm border border-foreground/5">
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
    </div>
  );
}
