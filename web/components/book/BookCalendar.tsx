'use client';

import type { MonthGrid, DayCell } from '@/lib/book/analytics';
import { fmtNet, fmtNetTotal } from '@/lib/book/model';

/**
 * THE CALENDAR — one cell per Eastern day, net in the user's money, green up,
 * red down, gold for a push day, a gold dot for open slips. Tap a day to see
 * every slip on it. Cells follow the page's source filter, never the period.
 */
export function BookCalendar({
  grid,
  today,
  unitDollars,
  canMoveForward,
  selectedDay,
  onShift,
  onSelect,
}: {
  grid: MonthGrid;
  today: string;
  unitDollars: number;
  canMoveForward: boolean;
  selectedDay: string | null;
  onShift: (steps: number) => void;
  onSelect: (day: DayCell) => void;
}) {
  const fill = (cell: DayCell) => {
    if (cell.net != null) {
      if (cell.net > 0.005) return 'bg-win/20';
      if (cell.net < -0.005) return 'bg-loss/20';
      return 'bg-gold/15';
    }
    return cell.pendingCount > 0 ? 'bg-white/[0.07]' : 'bg-white/[0.03]';
  };
  const tint = (net: number) => (net > 0.005 ? 'text-win' : net < -0.005 ? 'text-loss' : 'text-gold');
  return (
    <section className="quant-panel overflow-hidden" aria-labelledby="book-calendar-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id="book-calendar-heading" className="font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">
          The calendar
        </h2>
        <span className={`tnum font-mono text-[12px] font-bold ${grid.settledCount === 0 ? 'text-low' : grid.net >= 0 ? 'text-win' : 'text-loss'}`}>
          {grid.settledCount > 0 ? `${grid.activeDays} days · ${fmtNetTotal(grid.net, unitDollars)}` : 'No settled plays'}
        </span>
      </div>
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => onShift(-1)} aria-label="Previous month" className="h-9 w-9 rounded-chip text-gold hover:bg-white/5">
            ‹
          </button>
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-hi">{grid.kicker}</span>
          <button
            type="button"
            onClick={() => onShift(1)}
            disabled={!canMoveForward}
            aria-label="Next month"
            className="h-9 w-9 rounded-chip text-gold hover:bg-white/5 disabled:text-white/20"
          >
            ›
          </button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 font-mono text-[9px] font-bold uppercase text-low">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className="text-center">{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1" aria-label={grid.title}>
          {grid.weeks.flat().map((cell) => {
            const active = cell.settledCount > 0 || cell.pendingCount > 0;
            const isToday = cell.date === today;
            const selected = cell.date === selectedDay;
            return (
              <button
                key={cell.date}
                type="button"
                disabled={!active}
                onClick={() => onSelect(cell)}
                aria-pressed={selected}
                aria-label={`${cell.date}${cell.net != null ? `, net ${fmtNet(cell.net, unitDollars)}, ${cell.settledCount} settled` : ''}${cell.pendingCount ? `, ${cell.pendingCount} open` : ''}${active ? '' : ', no plays'}`}
                className={`flex min-h-[52px] flex-col justify-between rounded-card border px-1.5 py-1 text-left ${fill(cell)} ${
                  selected ? 'border-gold' : isToday ? 'border-gold/70' : 'border-white/[0.06]'
                } ${cell.inMonth ? '' : 'opacity-35'} ${active ? 'cursor-pointer hover:border-gold/60' : 'cursor-default'}`}
              >
                <span className="flex items-center justify-between">
                  <span className={`font-mono text-[9.5px] ${isToday ? 'font-bold text-gold' : 'text-mid'}`}>{cell.day}</span>
                  {cell.pendingCount > 0 && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />}
                </span>
                {cell.net != null ? (
                  <span className={`tnum truncate font-mono text-[10px] font-bold ${tint(cell.net)}`}>{fmtNet(cell.net, unitDollars)}</span>
                ) : cell.pendingCount > 0 ? (
                  <span className="truncate font-mono text-[8px] font-bold uppercase text-mid">{cell.pendingCount} open</span>
                ) : (
                  <span className="font-mono text-[10px]">&nbsp;</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.05em] text-faint">
          Tap a day to see every slip on it. Cells follow your source filter.
        </p>
      </div>
    </section>
  );
}
