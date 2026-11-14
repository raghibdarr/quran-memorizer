'use client';

import SegmentedControl from '@/components/ui/segmented-control';
import { ChevronDownIcon } from '@/components/ui/icons';
import { TIME_LABELS, type AlertMode, type PrayerAlert, type PrayerName } from '@/types/prayer';
import type { AlertPlatform } from '@/lib/prayer/schedule';

export const MODE_LABELS: Record<AlertMode, string> = {
  off: 'Off',
  silent: 'Silent',
  default: 'Sound',
  chime: 'Chime',
};

export const PRE_ALERT_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60] as const;

interface Props {
  prayer: PrayerName;
  /** Today's time in the place's zone, or null when it doesn't occur */
  time: string | null;
  alert: PrayerAlert;
  modes: AlertMode[];
  platform: Exclude<AlertPlatform, 'web'>;
  onMode: (mode: AlertMode) => void;
  onPreAlert: (minutes: number) => void;
}

/** One prayer: its alert sound and an optional heads-up before it */
export default function PrayerAlertRow({ prayer, time, alert, modes, platform, onMode, onPreAlert }: Props) {
  const label = TIME_LABELS[prayer];
  // A chime chosen on Android and restored on iPhone plays the system sound
  const shown: AlertMode = modes.includes(alert.mode) ? alert.mode : 'default';
  const choices: number[] = PRE_ALERT_CHOICES.includes(alert.preAlertMin as (typeof PRE_ALERT_CHOICES)[number])
    ? [...PRE_ALERT_CHOICES]
    : [...PRE_ALERT_CHOICES, alert.preAlertMin].sort((a, b) => a - b);

  return (
    <div className="px-4 py-3" data-alert-row={prayer}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold text-foreground">{label}</span>
        {time && <span className="text-sm tabular-nums text-muted">today {time}</span>}
      </div>
      <div role="group" aria-label={`${label} alert`}>
        <SegmentedControl options={modes.map((m) => ({ value: m, label: MODE_LABELS[m] }))} value={shown} onChange={onMode} />
      </div>
      {alert.mode !== 'off' && (
        <label className="mt-2 flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm text-foreground">Heads-up</span>
          <span className="relative">
            <select
              value={alert.preAlertMin}
              onChange={(e) => onPreAlert(Number(e.target.value))}
              className="min-h-11 appearance-none rounded-xl bg-foreground/5 py-2 pr-9 pl-3 text-sm font-medium text-foreground"
              aria-label={`Heads-up before ${label}`}
            >
              {choices.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'None' : `${m} min before`}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
          </span>
        </label>
      )}
      {platform === 'ios' && alert.mode === 'chime' && (
        <p className="mt-1 text-xs text-muted">The chime is Android only; iPhone plays its notification sound.</p>
      )}
    </div>
  );
}
