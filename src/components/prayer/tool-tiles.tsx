import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import {
  BeadsIcon,
  CalendarIcon,
  CheckCircleIcon,
  CoinsIcon,
  CompassIcon,
  MapPinIcon,
  MoonIcon,
} from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { readyTools, type PrayerTool } from '@/lib/prayer/tools';

const TOOL_ICONS: Record<PrayerTool['id'], (p: { size?: number; className?: string }) => React.ReactNode> = {
  qibla: CompassIcon,
  tasbih: BeadsIcon,
  tracker: CheckCircleIcon,
  calendar: CalendarIcon,
  ramadan: MoonIcon,
  zakat: CoinsIcon,
  mosques: MapPinIcon,
};

/**
 * The tool tiles on the /prayer hub (spec 2.2, 3.3): two columns on a phone,
 * three wider up. Tiles are one height whether the detail takes one line or
 * two, and a last tile left on its own takes the whole row as a list row.
 * Only tools with `ready: true` show.
 */
export default function PrayerToolTiles({ tools = readyTools() }: { tools?: readonly PrayerTool[] }) {
  const n = tools.length;
  if (n === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-prayer-tools>
      {tools.map((t, i) => {
        const Icon = TOOL_ICONS[t.id];
        const last = i === n - 1;
        // On its own in the last row: two columns (phone), three (wider)
        const wide = last && n % 2 === 1;
        const wideSm = last && n % 3 === 1;
        return (
          <li key={t.id} className={cn(wide && 'col-span-2', wideSm ? 'sm:col-span-3' : wide && 'sm:col-span-1')}>
            <Link href={t.href} className="block h-full">
              <Card
                pressable
                className={cn(
                  'flex h-full p-4',
                  wide ? 'flex-row items-center gap-3' : 'flex-col',
                  wideSm ? 'sm:flex-row sm:items-center sm:gap-3' : 'sm:flex-col sm:items-stretch sm:gap-0',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal',
                    wide ? 'mb-0' : 'mb-2',
                    wideSm ? 'sm:mb-0' : 'sm:mb-2',
                  )}
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{t.title}</span>
                  {/* On a phone two lines are kept for the detail so every tile is one height */}
                  <span
                    className={cn(
                      'mt-0.5 line-clamp-2 text-xs leading-4 text-muted',
                      // Wider up every detail fits on one line, so no need to hold two
                      !wide && 'min-h-8 sm:min-h-0',
                    )}
                  >
                    {t.detail}
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={cn('shrink-0 text-muted', wide ? 'block' : 'hidden', wideSm ? 'sm:block' : 'sm:hidden')}
                  aria-hidden
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
