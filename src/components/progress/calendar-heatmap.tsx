'use client';

import { useState, useRef } from 'react';
import { todayIso } from '@/lib/dates';
import { HIJRI_MONTHS, toHijri } from '@/lib/hijri/convert';
import { weekColumn, weekdayLabels, weekdayOfIso } from '@/lib/weekdays';
import { useWeekStart } from '@/hooks/use-week-start';
import { usePrayerStore } from '@/stores/prayer-store';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** One day's cell: its civil day and the Hijri day the rest of the app shows for it */
export interface HeatCell {
  day: number | null;
  date: string;
  count: number;
  isToday: boolean;
  hijriDay: number;
  /** Set on the first of a Hijri month */
  hijriMonth: number | null;
}

/**
 * The cells of one civil month (leading blanks for the week's first day). Hijri
 * days come from the app's one calendar (src/lib/hijri/convert.ts) under the
 * user's Hijri adjustment, so they match /calendar, /prayer and /ramadan.
 */
export function heatmapCells(year: number, month: number, opts: { activityLog: Record<string, number>; today: string; hijriOffset: number; weekStart: number }): HeatCell[] {
  const cells: HeatCell[] = [];
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lead = weekColumn(weekdayOfIso(first), opts.weekStart);
  for (let i = 0; i < lead; i++) cells.push({ day: null, date: '', count: 0, isToday: false, hijriDay: 0, hijriMonth: null });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const h = toHijri(date, opts.hijriOffset);
    cells.push({ day: d, date, count: opts.activityLog[date] ?? 0, isToday: date === opts.today, hijriDay: h.day, hijriMonth: h.day === 1 ? h.month : null });
  }
  return cells;
}

/** "Jumada al-Ula – Jumada al-Akhirah 1448 AH" for the Hijri months a civil month spans */
export function hijriSpan(cells: HeatCell[], hijriOffset: number): string {
  const days = cells.filter((c) => c.day !== null);
  const a = toHijri(days[0].date, hijriOffset);
  const b = toHijri(days[days.length - 1].date, hijriOffset);
  if (a.month === b.month) return `${HIJRI_MONTHS[a.month - 1]} ${a.year} AH`;
  return a.year === b.year
    ? `${HIJRI_MONTHS[a.month - 1]} – ${HIJRI_MONTHS[b.month - 1]} ${b.year} AH`
    : `${HIJRI_MONTHS[a.month - 1]} ${a.year} – ${HIJRI_MONTHS[b.month - 1]} ${b.year} AH`;
}

function getIntensityClass(count: number): string {
  if (count === 0) return '';
  if (count === 1) return 'bg-teal/20';
  if (count <= 3) return 'bg-teal/45';
  return 'bg-teal';
}

interface Props {
  activityLog: Record<string, number>;
}

export default function CalendarHeatmap({ activityLog }: Props) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => { setViewDate(new Date(year, month - 1, 1)); setSelectedDate(null); };
  const nextMonth = () => {
    const now = new Date();
    const next = new Date(year, month + 1, 1);
    if (next <= new Date(now.getFullYear(), now.getMonth() + 1, 1)) {
      setViewDate(next);
      setSelectedDate(null);
    }
  };

  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth();

  const today = todayIso();
  const hijriOffset = usePrayerStore((st) => st.hijriOffset);
  const weekStart = useWeekStart();
  const cells = heatmapCells(year, month, { activityLog, today, hijriOffset, weekStart });
  const hijriSubtitle = hijriSpan(cells, hijriOffset);

  const monthTotal = cells.reduce((sum, c) => sum + c.count, 0);
  const activeDays = cells.filter((c) => c.count > 0).length;

  // Selected day info
  const selectedCell = selectedDate ? cells.find((c) => c.date === selectedDate) : null;

  return (
    <div>
      {/* Month navigation */}
      <div className="mb-1 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="hit-44 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-foreground/5 hover:text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {MONTHS[month]} {year}
          </p>
          <p className="text-[10px] leading-relaxed text-muted">{hijriSubtitle}</p>
        </div>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          className="hit-44 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-foreground/5 hover:text-foreground disabled:opacity-20"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1 mt-3">
        {weekdayLabels(weekStart).map((d, i) => (
          <div key={i} className="text-center text-[11px] font-medium text-muted">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          const isSelected = cell.date === selectedDate;
          return (
            <button
              key={i}
              disabled={cell.day === null}
              onClick={() => {
                if (cell.day === null) return;
                const newDate = isSelected ? null : cell.date;
                setSelectedDate(newDate);
                if (newDate) setTimeout(() => {
                  const el = detailRef.current;
                  if (!el) return;
                  const rect = el.getBoundingClientRect();
                  const navHeight = 80;
                  const bottom = rect.bottom + navHeight;
                  if (bottom > window.innerHeight) {
                    window.scrollBy({ top: bottom - window.innerHeight + 16, behavior: 'smooth' });
                  }
                }, 100);
              }}
              className={`flex min-h-[3.2rem] flex-col items-center justify-start rounded-lg pt-1.5 pb-1 text-sm transition-all ${
                cell.day === null
                  ? ''
                  : isSelected
                  ? 'ring-2 ring-gold font-bold text-foreground'
                  : cell.isToday
                  ? 'ring-2 ring-teal font-bold text-teal'
                  : cell.count > 0
                  ? 'font-medium text-foreground'
                  : 'text-muted'
              } ${cell.day !== null ? `${getIntensityClass(cell.count)} hover:bg-foreground/10` : ''}`}
            >
              {cell.day !== null && (
                <>
                  <span className="leading-none">{cell.day}</span>
                  <span
                    className={`mt-0.5 text-center text-[11px] leading-tight tabular-nums ${cell.hijriMonth ? 'font-semibold text-gold-deep' : 'font-normal'}`}
                    data-hijri-day={cell.hijriDay}
                  >
                    {cell.hijriDay}
                  </span>
                  {cell.count > 0 && (
                    <div className="mt-0.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-teal" />
                    </div>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedCell && (
        <div ref={detailRef} className="mt-3 rounded-lg bg-foreground/5 px-3 py-2 text-center text-xs text-muted">
          {selectedCell.count > 0
            ? <><span className="font-semibold text-teal">{selectedCell.count}</span> {selectedCell.count === 1 ? 'activity' : 'activities'} completed on {new Date(selectedCell.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</>
            : <>No activity on {new Date(selectedCell.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</>
          }
        </div>
      )}

      {/* Monthly summary */}
      {!selectedCell && (
        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted">
          <span>{monthTotal} {monthTotal === 1 ? 'activity' : 'activities'} completed</span>
          <span>{activeDays} active day{activeDays !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}
