'use client';

import { useState, useRef } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabi I', 'Rabi II', 'Jumada I', 'Jumada II', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhul Qadah', 'Dhul Hijjah'];
const HIJRI_MONTHS_FULL = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Thani', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhul Qadah', 'Dhul Hijjah'];

/**
 * Approximate Gregorian to Hijri conversion.
 * Uses the Umm al-Qura approximation — accurate to ±1 day.
 */
function toHijri(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const jd = Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4)
    + Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12)
    - Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4)
    + day - 32075;

  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const remainder = l - 10631 * n + 354;
  const j = Math.floor((10985 - remainder) / 5316) * Math.floor((50 * remainder) / 17719)
    + Math.floor(remainder / 5670) * Math.floor((43 * remainder) / 15238);
  const remainderL = remainder - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;

  const hMonth = Math.floor((24 * remainderL) / 709);
  const hDay = remainderL - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;

  return { year: hYear, month: hMonth, day: hDay };
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

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  // Hijri date for subtitle
  const hijri1st = toHijri(year, month + 1, 1);
  const hijriLast = toHijri(year, month + 1, daysInMonth);
  const hijriSubtitle = hijri1st.month === hijriLast.month
    ? `${HIJRI_MONTHS_FULL[hijri1st.month - 1]} ${hijri1st.year} AH`
    : `${HIJRI_MONTHS_FULL[hijri1st.month - 1]} – ${HIJRI_MONTHS_FULL[hijriLast.month - 1]} ${hijriLast.year} AH`;

  // Build calendar grid
  const cells: Array<{
    day: number | null;
    date: string;
    count: number;
    isToday: boolean;
    hijriDay: number;
    hijriMonthName: string | null;
  }> = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, date: '', count: 0, isToday: false, hijriDay: 0, hijriMonthName: null });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const h = toHijri(year, month + 1, d);
    cells.push({
      day: d,
      date: dateStr,
      count: activityLog[dateStr] ?? 0,
      isToday: dateStr === today,
      hijriDay: h.day,
      hijriMonthName: h.day === 1 ? HIJRI_MONTHS[h.month - 1] : null,
    });
  }

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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-foreground/5 hover:text-foreground"
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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-foreground/5 hover:text-foreground disabled:opacity-20"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1 mt-3">
        {DAYS.map((d, i) => (
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
                  : 'text-muted/40'
              } ${cell.day !== null ? getIntensityClass(cell.count) : ''}`}
            >
              {cell.day !== null && (
                <>
                  <span className="leading-none">{cell.day}</span>
                  <span className={`mt-0.5 leading-tight text-center ${cell.hijriMonthName ? 'text-[8px] text-gold/70' : 'text-[9px] text-muted/30'}`}>
                    {cell.hijriMonthName
                      ? <>{cell.hijriDay}<br />{cell.hijriMonthName}</>
                      : cell.hijriDay}
                  </span>
                  {cell.count > 0 && !cell.hijriMonthName && (
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
