'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  claimHandle,
  fetchMyBets,
  fetchMyHandle,
  fetchMyStreak,
  type UserStreak,
} from '@/lib/book/api';
import {
  bookRecord,
  cumulativeSeries,
  filterBets,
  fmtNetTotal,
  isVerified,
  trackerStats,
  type Source,
  type Timeframe,
  type UserBet,
} from '@/lib/book/model';
import type { GaryRows } from '@/lib/book/gary';
import { useUnitDollars } from './BookDay';
import { Ledger, OpenSlips } from './BookSlips';
import { Leaderboard } from './Leaderboard';
import { LogBet } from './LogBet';
import { RideChart } from './RideChart';

// ─────────────────────────────────────────────────────────────────────────────
// YOUR BOOK — the signed-in tracker (web port of the app's YOU page).
// Two ledgers, never mixed: WITH GARY (system-graded tails/fades, the
// flagship unfakeable number) and YOUR PLAYS (self-graded, labeled).
// ─────────────────────────────────────────────────────────────────────────────

const STREAK_TINT = '#E5844B';

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'season', label: 'SEASON' },
  { key: 'all', label: 'ALL' },
];

const SOURCES: { key: Source; label: string }[] = [
  { key: 'all', label: 'EVERYTHING' },
  { key: 'tail', label: 'TAILS' },
  { key: 'fade', label: 'FADES' },
  { key: 'manual', label: 'YOUR PLAYS' },
];

function chipTabs<K extends string>(
  items: { key: K; label: string }[],
  active: K,
  onPick: (k: K) => void,
) {
  return (
    <div className="flex items-center gap-4">
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={() => onPick(item.key)}
          className={`flex flex-col items-center gap-[3px] font-mono text-[10.5px] font-bold tracking-[0.08em] transition-colors ${
            active === item.key ? 'text-gold' : 'text-low hover:text-mid'
          }`}
        >
          {item.label}
          <span aria-hidden className={`h-[1.5px] w-full ${active === item.key ? 'bg-gold' : 'bg-transparent'}`} />
        </button>
      ))}
    </div>
  );
}

function RecordPanel({
  title,
  sub,
  rows,
  unitDollars,
  flagship,
}: {
  title: string;
  sub: string;
  rows: UserBet[];
  unitDollars: number;
  flagship?: boolean;
}) {
  const settled = rows.filter(b => b.status !== 'pending');
  const rec = bookRecord(settled);
  return (
    <div className={`rounded-card border bg-card px-5 py-4 ${flagship ? 'border-gold/40' : 'border-line'}`}>
      <p className={`font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] ${flagship ? 'text-gold' : 'text-low'}`}>
        {title}
      </p>
      {rec.wins + rec.losses + rec.pushes > 0 ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="tnum font-display text-[1.9rem] leading-none text-hi">
            {rec.wins}-{rec.losses}
            {rec.pushes > 0 ? `-${rec.pushes}` : ''}
          </span>
          <span
            className={`tnum font-mono text-[13.5px] font-bold ${
              rec.units > 0 ? 'text-win' : rec.units < 0 ? 'text-loss' : 'text-mid'
            }`}
          >
            {fmtNetTotal(rec.units, unitDollars)}
          </span>
          {rec.pct !== null && <span className="tnum font-mono text-[11.5px] text-low">{rec.pct}%</span>}
        </div>
      ) : (
        <p className="mt-2 text-[13.5px] text-mid">{sub}</p>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-card border border-line bg-card px-4 py-3">
      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-low">{label}</p>
      <p className="tnum mt-1 font-display text-[1.35rem] leading-none text-hi">{value ?? '—'}</p>
    </div>
  );
}

/** Inline unit-size ask — shows until a value is saved or dismissed. */
function UnitAsk({ onSave, onSkip }: { onSave: (v: number) => void; onSkip: () => void }) {
  const [text, setText] = useState('');
  const quick = [10, 25, 50, 100];
  return (
    <div className="rounded-card border border-line bg-card px-5 py-4">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold">
        What&apos;s a unit worth to you?
      </p>
      <p className="mt-1 text-[13px] text-mid">
        Your typical bet, in dollars. Your book shows real money from then on.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {quick.map(amt => (
          <button
            key={amt}
            type="button"
            onClick={() => setText(String(amt))}
            className={`flex flex-col items-center gap-[3px] font-mono text-[12px] font-bold ${
              text === String(amt) ? 'text-gold' : 'text-low hover:text-mid'
            }`}
          >
            ${amt}
            <span aria-hidden className={`h-[1.5px] w-full ${text === String(amt) ? 'bg-gold' : 'bg-transparent'}`} />
          </button>
        ))}
        <span className="flex items-center gap-1.5 rounded-chip border border-line bg-chip px-3 py-2">
          <span className="font-mono text-[13px] text-low">$</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="25"
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-[64px] bg-transparent font-mono text-[13.5px] font-bold text-hi outline-none placeholder:text-low"
          />
        </span>
        <button
          type="button"
          onClick={() => {
            const v = parseFloat(text);
            if (Number.isFinite(v) && v > 0) onSave(v);
            else onSkip();
          }}
          className="rounded-chip bg-gold px-4 py-2 font-mono text-[11.5px] font-bold text-ink transition-opacity hover:opacity-90"
        >
          {parseFloat(text) > 0 ? 'Save' : 'Keep units for now'}
        </button>
      </div>
    </div>
  );
}

export function BookClient({ garyRows }: { garyRows: GaryRows }) {
  const [bets, setBets] = useState<UserBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState<UserStreak | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [source, setSource] = useState<Source>('all');
  const [showLog, setShowLog] = useState(false);
  const [unitDollars, setUnitDollars] = useUnitDollars();
  const [unitAskDismissed, setUnitAskDismissed] = useState(false);

  const [claimText, setClaimText] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const rows = await fetchMyBets();
    setBets(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    fetchMyStreak().then(setStreak);
    fetchMyHandle().then(setHandle);
  }, [reload]);

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimBusy(true);
    setClaimError(null);
    try {
      setHandle(await claimHandle(claimText.trim()));
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Try another handle.');
    } finally {
      setClaimBusy(false);
    }
  };

  const withGary = bets.filter(isVerified);
  const yourPlays = bets.filter(b => b.kind === 'manual');
  const filtered = filterBets(bets, timeframe, source);
  const stats = trackerStats(filtered);
  const series = cumulativeSeries(filtered);
  const hasAnyBet = bets.length > 0;

  return (
    <div className="mt-7 space-y-5">
      {/* Identity row: handle + streak + log */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {handle ? (
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/70 font-mono text-[14px] font-bold uppercase text-gold">
              {handle[0]}
            </span>
            <span className="font-mono text-[14px] font-bold tracking-[0.03em] text-hi">{handle}</span>
          </span>
        ) : (
          <form onSubmit={claim} className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              placeholder="Claim a handle"
              value={claimText}
              onChange={e => setClaimText(e.target.value)}
              minLength={3}
              maxLength={18}
              className="w-[170px] rounded-chip border border-line bg-chip px-3.5 py-2 font-mono text-[13px] text-hi placeholder:text-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
            />
            <button
              type="submit"
              disabled={claimBusy || claimText.trim().length < 3}
              className="rounded-chip border border-gold/60 px-3.5 py-2 font-mono text-[11.5px] font-bold text-gold transition-colors hover:bg-gold/10 disabled:opacity-50"
            >
              Claim it
            </button>
            {claimError && <span className="font-mono text-[10.5px] text-loss/90">{claimError}</span>}
          </form>
        )}
        {(streak?.current ?? 0) >= 2 && (
          <span className="font-mono text-[11px] font-bold tracking-[0.08em]" style={{ color: STREAK_TINT }}>
            DAY {streak!.current} OF THE STREAK
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setShowLog(v => !v)}
          className="rounded-chip border border-line px-3.5 py-2 font-mono text-[11.5px] font-bold text-mid transition-colors hover:border-gold/50 hover:text-hi"
        >
          + Log a bet
        </button>
      </div>

      {showLog && (
        <LogBet
          onLogged={bet => setBets(prev => [bet, ...prev])}
          onClose={() => setShowLog(false)}
        />
      )}

      {unitDollars === 0 && !unitAskDismissed && hasAnyBet && (
        <UnitAsk onSave={setUnitDollars} onSkip={() => setUnitAskDismissed(true)} />
      )}

      {/* The two ledgers, never mixed */}
      <div className="grid gap-4 sm:grid-cols-2">
        <RecordPanel
          title="With Gary"
          sub="Ride or fade a pick on the board and the record starts here — graded by the same system that grades Gary."
          rows={withGary}
          unitDollars={unitDollars}
          flagship
        />
        <RecordPanel
          title="Your plays"
          sub="Bets you log yourself, graded by you, labeled that way."
          rows={yourPlays}
          unitDollars={unitDollars}
        />
      </div>

      {loading ? (
        <p className="font-mono text-[11.5px] text-low">Loading your book</p>
      ) : hasAnyBet ? (
        <>
          {/* Tracker controls */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            {chipTabs(TIMEFRAMES, timeframe, setTimeframe)}
            {chipTabs(SOURCES, source, setSource)}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Win %" value={stats.winPct !== null ? `${stats.winPct}%` : null} />
            <StatTile label="ROI" value={stats.roiPct !== null ? `${stats.roiPct >= 0 ? '+' : ''}${stats.roiPct}%` : null} />
            <StatTile
              label="Avg odds"
              value={stats.avgOdds !== null ? (stats.avgOdds > 0 ? `+${stats.avgOdds}` : `${stats.avgOdds}`) : null}
            />
            <StatTile
              label="Best day"
              value={stats.bestDay ? fmtNetTotal(stats.bestDay.units, unitDollars) : null}
            />
          </div>

          <RideChart series={series} unitDollars={unitDollars} />
          <OpenSlips bets={filtered} unitDollars={unitDollars} onChanged={reload} />
          <Ledger bets={filtered} unitDollars={unitDollars} />
        </>
      ) : (
        <div className="rounded-panel border border-line bg-card px-6 py-8 text-center">
          <p className="text-[15px] text-mid">
            Your book is empty. Ride or fade a pick on the board, or log a bet you placed elsewhere —
            every result lands here, graded on the record.
          </p>
        </div>
      )}

      <Leaderboard garyRows={garyRows} myHandle={handle} />
    </div>
  );
}
