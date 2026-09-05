'use client';

import { useEffect, useState } from 'react';
import { deleteBet, gradeManual, setStreakPick, updateBet } from '@/lib/book/api';
import {
  fmtNet,
  fmtNetTotal,
  fmtOdds,
  fmtStake,
  groupLedgerDays,
  isBetLocked,
  manualUnits,
  type UserBet,
} from '@/lib/book/model';
import { bookButton, bookField, LogBet } from './LogBet';
import { logBookMilestone } from '@/lib/gary/analytics';

function Slip({
  bet,
  unitDollars,
  onChanged,
}: {
  bet: UserBet;
  unitDollars: number;
  onChanged?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(bet.notes ?? '');
  const [removing, setRemoving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (bet.kind === 'manual' || bet.status !== 'pending') return;
    const interval = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(interval);
  }, [bet.kind, bet.status]);
  const locked = isBetLocked(bet, now);
  const open = bet.status === 'pending';
  const manual = bet.kind === 'manual';
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged?.();
      setRemoving(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your change could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  const grade = (status: 'pending' | 'won' | 'lost' | 'push' | 'void') =>
    run(async () => {
      await gradeManual(bet.id, status, manualUnits(status, bet.stake_units, bet.odds_american));
      if (status !== 'pending') logBookMilestone('manual_bet_settled');
    });
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <button
          disabled={busy || !onChanged}
          onClick={() => run(() => updateBet(bet.id, { is_favorite: !bet.is_favorite }))}
          aria-label={bet.is_favorite ? 'Remove from favorites' : 'Save as favorite'}
          aria-pressed={!!bet.is_favorite}
          className={`mt-0.5 text-lg ${bet.is_favorite ? 'text-gold' : 'text-low'}`}
        >
          {bet.is_favorite ? '★' : '☆'}
        </button>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[14px] leading-relaxed text-hi">
            {bet.pick_type === 'prop' && bet.player_name ? `${bet.player_name} · ` : ''}
            {bet.pick_text}
          </p>
          <p className="mt-1 font-mono text-[10px] text-low">
            {[bet.league, bet.matchup, bet.game_date, bet.bookmaker].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`font-mono text-[12px] ${bet.status === 'won' ? 'text-win' : bet.status === 'lost' ? 'text-loss' : 'text-mid'}`}
          >
            {open
              ? fmtStake(bet.stake_units, unitDollars)
              : ['push', 'void'].includes(bet.status)
                ? bet.status.toUpperCase()
                : fmtNet(bet.units_net ?? 0, unitDollars)}
          </p>
          <p className="mt-1 font-mono text-[10px] text-low">
            {fmtOdds(bet.odds_american)}
            {bet.odds_estimated ? ' est.' : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-chip bg-white/5 px-2 py-1 font-mono text-[9px] uppercase tracking-wider ${manual ? 'text-mid' : 'text-gold'}`}
        >
          {manual ? 'Self-graded' : `Verified ${bet.kind}`}
        </span>
        {bet.streak_pick && <span className="font-mono text-[10px] text-[#E5844B]">STREAK PICK</span>}
        {!open && <span className="font-mono text-[10px] uppercase text-low">{bet.status}</span>}
        {open && !manual && locked && (
          <span className="text-[11px] text-low">Locked · settles automatically</span>
        )}
      </div>
      {onChanged && (
        <div className="mt-3 flex flex-wrap gap-2">
          {manual && open && (
            <>
              {(['won', 'lost', 'push', 'void'] as const).map((s) => (
                <button key={s} disabled={busy} className={bookButton} onClick={() => grade(s)}>
                  {s === 'won' ? 'Won' : s === 'lost' ? 'Lost' : s === 'push' ? 'Push' : 'Void'}
                </button>
              ))}
            </>
          )}
          {manual && !open && (
            <button disabled={busy} className={bookButton} onClick={() => grade('pending')}>
              Correct result
            </button>
          )}
          {manual && (
            <button disabled={busy} className={bookButton} onClick={() => setEditing((v) => !v)}>
              Edit bet
            </button>
          )}
          {!manual && !locked && (
            <button
              disabled={busy}
              className={`${bookButton} ${bet.streak_pick ? 'text-[#E5844B]' : ''}`}
              onClick={() => run(() => setStreakPick(bet.id, !bet.streak_pick))}
            >
              {bet.streak_pick ? 'Remove streak pick' : 'Make streak pick'}
            </button>
          )}
          <button disabled={busy} className={bookButton} onClick={() => setShowNotes((v) => !v)}>
            {bet.notes ? 'Edit notes' : 'Add notes'}
          </button>
          {(manual || !locked) && (
            <button disabled={busy} className={bookButton} onClick={() => setRemoving(true)}>
              {manual ? 'Delete' : 'Undo call'}
            </button>
          )}
        </div>
      )}
      {bet.notes && !showNotes && (
        <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-mid">{bet.notes}</p>
      )}
      {showNotes && (
        <div className="mt-3">
          <label className="text-[12px] text-mid">
            Private notes
            <textarea
              className={bookField}
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <button
            disabled={busy}
            className={`${bookButton} mt-2`}
            onClick={() =>
              run(async () => {
                await updateBet(bet.id, { notes });
                setShowNotes(false);
              })
            }
          >
            Save notes
          </button>
        </div>
      )}
      {removing && (
        <div className="mt-3 rounded-chip border border-line bg-chip p-3">
          <p className="text-[12px] text-mid">
            {manual ? 'Delete this bet from your private record?' : 'Remove this call before it locks?'}
          </p>
          <div className="mt-2 flex gap-2">
            <button disabled={busy} className={bookButton} onClick={() => run(() => deleteBet(bet.id))}>
              Confirm remove
            </button>
            <button disabled={busy} className={bookButton} onClick={() => setRemoving(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {editing && (
        <div className="mt-4">
          <LogBet
            existing={bet}
            onLogged={() => {
              void onChanged?.();
            }}
            onClose={() => setEditing(false)}
          />
        </div>
      )}
      {busy && (
        <p role="status" className="mt-2 text-[11px] text-low">
          Saving…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[12px] text-loss">
          {error}
        </p>
      )}
    </li>
  );
}

export function OpenSlips({
  bets,
  unitDollars,
  onChanged,
}: {
  bets: UserBet[];
  unitDollars: number;
  onChanged: () => void | Promise<void>;
}) {
  const open = bets.filter((b) => b.status === 'pending');
  if (!open.length) return null;
  return (
    <section className="quant-panel overflow-hidden">
      <div className="flex justify-between border-b border-line px-5 py-3">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-gold">Open slips</h2>
        <span className="font-mono text-[11px] text-low">{open.length}</span>
      </div>
      <ul className="divide-y divide-line">
        {open.map((bet) => (
          <Slip key={bet.id} bet={bet} unitDollars={unitDollars} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

export function Ledger({
  bets,
  unitDollars,
  onChanged,
}: {
  bets: UserBet[];
  unitDollars: number;
  onChanged?: () => void | Promise<void>;
}) {
  const [limit, setLimit] = useState(30);
  const days = groupLedgerDays(bets);
  if (!days.length) return null;
  return (
    <section className="quant-panel overflow-hidden">
      <h2 className="border-b border-line px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-gold">
        The ledger
      </h2>
      {days.slice(0, limit).map((day) => (
        <div key={day.date}>
          <div className="flex justify-between bg-white/[0.03] px-5 py-2 font-mono text-[11px]">
            <span className="text-low">{day.date}</span>
            <span className={day.net >= 0 ? 'text-win' : 'text-loss'}>
              {fmtNetTotal(day.net, unitDollars)}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {day.rows.map((bet) => (
              <Slip key={bet.id} bet={bet} unitDollars={unitDollars} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      ))}
      {days.length > limit && (
        <button className={`${bookButton} m-5`} onClick={() => setLimit((n) => n + 30)}>
          Show older days
        </button>
      )}
    </section>
  );
}
