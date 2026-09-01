'use client';

import { useEffect, useState } from 'react';
import { fetchLeaderboard, type BoardRow } from '@/lib/book/api';
import type { GaryRows } from '@/lib/book/gary';

/**
 * Public standings — verified-ledger-only (tails/fades the server graded),
 * five decided bets to rank, units never dollars. Gary rides the same board
 * as an official comparator, computed from his public graded record.
 */

const WINDOWS = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'season', label: 'SEASON' },
] as const;

type WindowKey = (typeof WINDOWS)[number]['key'];

export function Leaderboard({ garyRows, myHandle }: { garyRows: GaryRows; myHandle?: string | null }) {
  const [window_, setWindow] = useState<WindowKey>('30d');
  const [rows, setRows] = useState<BoardRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard(window_).then(users => {
      if (cancelled) return;
      const gary = garyRows[window_];
      const merged = gary
        ? [...users.filter(u => u.display_name.toLowerCase() !== gary.display_name.toLowerCase()), gary]
        : users;
      merged.sort((a, b) => (a.units === b.units ? a.display_name.localeCompare(b.display_name) : b.units - a.units));
      setRows(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [window_, garyRows]);

  return (
    <section className="quant-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3">
        <h2 className="font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">
          The leaderboard
        </h2>
        <div className="flex items-center gap-4">
          {WINDOWS.map(w => (
            <button
              key={w.key}
              type="button"
              aria-pressed={window_ === w.key}
              onClick={() => {
                if (window_ === w.key) return;
                setRows(null);
                setWindow(w.key);
              }}
              className={`flex flex-col items-center gap-[3px] font-mono text-[10.5px] font-bold tracking-[0.08em] transition-colors ${
                window_ === w.key ? 'text-gold' : 'text-low hover:text-mid'
              }`}
            >
              {w.label}
              <span aria-hidden className={`h-[1.5px] w-full ${window_ === w.key ? 'bg-gold' : 'bg-transparent'}`} />
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="px-5 py-6 font-mono text-[11.5px] text-low">Loading the board</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-[14px] text-mid">
          Nobody has ranked yet — five settled rides with Gary puts a handle on the board.
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((r, i) => {
            const gary = r.display_name === 'GARY A.I.';
            const me = myHandle != null && r.display_name.toLowerCase() === myHandle.toLowerCase();
            return (
              <li key={r.display_name} className="flex items-center gap-4 px-5 py-3">
                <span className="tnum w-6 shrink-0 font-mono text-[11.5px] font-bold text-faint">{i + 1}</span>
                <span
                  className={`min-w-0 flex-1 truncate font-mono text-[13px] font-bold tracking-[0.03em] ${
                    gary ? 'text-gold' : me ? 'text-gold-light' : 'text-hi'
                  }`}
                >
                  {r.display_name}
                  {me && !gary && <span className="ml-2 text-[10px] text-low">YOU</span>}
                </span>
                <span className="tnum shrink-0 font-mono text-[12px] text-mid">
                  {r.wins}-{r.losses}
                  {r.pushes > 0 ? `-${r.pushes}` : ''}
                </span>
                <span
                  className={`tnum w-[72px] shrink-0 text-right font-mono text-[12.5px] font-bold ${
                    r.units > 0 ? 'text-win' : r.units < 0 ? 'text-loss' : 'text-mid'
                  }`}
                >
                  {r.units >= 0 ? '+' : ''}
                  {r.units.toFixed(1)}u
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
