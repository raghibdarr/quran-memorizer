// The review queue made visible (roadmap #15): how many lesson and ayah reviews
// fall due on each of the next days. Pure. Overdue ones count toward today.

import { addLocalDays, isoFromMs, startOfDayMs } from './dates';

interface Due { nextReview: number }

export interface DayLoad { iso: string; lessons: number; ayahs: number }

export function upcoming(lessonCards: Due[], ayahCards: Due[], now = Date.now(), days = 7): DayLoad[] {
  const today = startOfDayMs(now);
  const out: DayLoad[] = Array.from({ length: days }, (_, i) => ({ iso: isoFromMs(addLocalDays(today, i)), lessons: 0, ayahs: 0 }));
  const slot = (ts: number) => {
    if (ts <= now) return 0;
    const iso = isoFromMs(ts);
    return out.findIndex((d) => d.iso === iso);
  };
  for (const c of lessonCards) { const i = slot(c.nextReview); if (i >= 0) out[i].lessons++; }
  for (const c of ayahCards) { const i = slot(c.nextReview); if (i >= 0) out[i].ayahs++; }
  return out;
}
