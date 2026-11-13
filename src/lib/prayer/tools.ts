// The tool tiles on the /prayer hub (all-in-one spec 3.3). Integration sets
// `ready: false` for any tool whose package did not land, which hides its tile.

export interface PrayerTool {
  id: 'qibla' | 'tasbih' | 'tracker' | 'calendar' | 'ramadan' | 'zakat' | 'mosques';
  title: string;
  /** One short line under the title */
  detail: string;
  href: string;
  ready: boolean;
}

export const PRAYER_TOOLS: readonly PrayerTool[] = [
  { id: 'qibla', title: 'Qibla', detail: 'Which way to face', href: '/qibla', ready: true },
  { id: 'tasbih', title: 'Tasbih', detail: 'A counter for dhikr', href: '/tasbih', ready: true },
  { id: 'tracker', title: 'Prayer log', detail: 'Your month at a glance', href: '/prayer/tracker', ready: true },
  { id: 'calendar', title: 'Hijri calendar', detail: 'Months and expected dates', href: '/calendar', ready: true },
  { id: 'ramadan', title: 'Ramadan', detail: 'Suhoor, iftar and your fasts', href: '/ramadan', ready: true },
  { id: 'zakat', title: 'Zakat', detail: 'Work out what is due', href: '/zakat', ready: true },
  { id: 'mosques', title: 'Mosques', detail: 'Nearby, from open map data', href: '/mosques', ready: true },
];

/** The tiles to show */
export function readyTools(tools: readonly PrayerTool[] = PRAYER_TOOLS): PrayerTool[] {
  return tools.filter((t) => t.ready);
}
