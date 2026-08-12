'use client';

import { useState } from 'react';
import { deleteBet, gradeManual } from '@/lib/book/api';
import {
  fmtNet,
  fmtNetTotal,
  fmtOdds,
  fmtStake,
  groupLedgerDays,
  manualUnits,
  type UserBet,
} from '@/lib/book/model';

/**
 * Open slips + THE LEDGER. Tails/fades settle themselves (the grader writes
 * them each run); manual plays get WON / LOST / PUSH buttons — self-graded
 * and labeled that way, never mixed into the verified ledger.
 */

const KIND_LABEL: Record<string, string> = { tail: 'TAIL', fade: 'FADE', manual: 'YOURS' };

function kindTint(kind: string): string {
  if (kind === 'tail') return '#C9A227';
  if (kind === 'fade') return '#8B93A7';
  return '#C7CCD6';
}

function slipTitle(bet: UserBet): string {
  if (bet.pick_type === 'prop' && bet.player_name) {
    return [bet.player_name, bet.description ?? bet.pick_text].filter(Boolean).join(' — ');
  }
  return bet.pick_text;
}

function SlipMeta({ bet }: { bet: UserBet }) {
  return (
    <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-faint">
      {[bet.league, bet.matchup, bet.game_date].filter(Boolean).join(' · ')}
    </p>
  );
}

function KindChip({ bet }: { bet: UserBet }) {
  const tint = kindTint(bet.kind);
  return (
    <span
      className="shrink-0 rounded-chip px-2 py-1 font-mono text-[9.5px] font-bold tracking-[0.08em]"
      style={{ color: tint, background: `${tint}1A` }}
    >
      {KIND_LABEL[bet.kind] ?? bet.kind.toUpperCase()}
      {bet.streak_pick ? ' · STREAK' : ''}
    </span>
  );
}

export function OpenSlips({
  bets,
  unitDollars,
  onChanged,
}: {
  bets: UserBet[];
  unitDollars: number;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const open = bets.filter(b => b.status === 'pending');
  if (open.length === 0) return null;

  const grade = async (bet: UserBet, status: 'won' | 'lost' | 'push') => {
    setBusyId(bet.id);
    const ok = await gradeManual(bet.id, status, manualUnits(status, bet.stake_units, bet.odds_american));
    setBusyId(null);
    if (ok) onChanged();
  };

  const remove = async (bet: UserBet) => {
    setBusyId(bet.id);
    const ok = await deleteBet(bet.id);
    setBusyId(null);
    if (ok) onChanged();
  };

  const gradeBtn =
    'rounded-chip border border-line px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.05em] text-mid transition-colors hover:border-gold/50 hover:text-hi disabled:opacity-40';

  return (
    <section className="quant-panel overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <h2 className="font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">Open slips</h2>
        <span className="tnum font-mono text-[11px] font-bold text-low">{open.length}</span>
      </div>
      <ul className="divide-y divide-line">
        {open.map(bet => (
          <li key={bet.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-hi">{slipTitle(bet)}</p>
              <SlipMeta bet={bet} />
            </div>
            <KindChip bet={bet} />
            <span className="tnum shrink-0 font-mono text-[12px] text-mid">
              {fmtStake(bet.stake_units, unitDollars)}
              {bet.odds_american != null && <span className="text-low"> · {fmtOdds(bet.odds_american)}</span>}
            </span>
            {bet.kind === 'manual' ? (
              <span className="flex shrink-0 items-center gap-1.5">
                <button type="button" disabled={busyId === bet.id} onClick={() => grade(bet, 'won')} className={gradeBtn}>
                  WON
                </button>
                <button type="button" disabled={busyId === bet.id} onClick={() => grade(bet, 'lost')} className={gradeBtn}>
                  LOST
                </button>
                <button type="button" disabled={busyId === bet.id} onClick={() => grade(bet, 'push')} className={gradeBtn}>
                  PUSH
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={busyId === bet.id}
                onClick={() => remove(bet)}
                className="shrink-0 font-mono text-[10.5px] text-low transition-colors hover:text-mid disabled:opacity-40"
              >
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Ledger({ bets, unitDollars }: { bets: UserBet[]; unitDollars: number }) {
  const days = groupLedgerDays(bets);
  if (days.length === 0) return null;

  return (
    <section className="quant-panel overflow-hidden">
      <div className="border-b border-line px-5 py-3">
        <h2 className="font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">The ledger</h2>
      </div>
      {days.map(day => (
        <div key={day.date}>
          <div className="flex items-baseline justify-between bg-white/[0.02] px-5 py-2">
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.07em] text-low">
              {day.date}
            </span>
            <span
              className={`tnum font-mono text-[11.5px] font-bold ${
                day.net > 0 ? 'text-win' : day.net < 0 ? 'text-loss' : 'text-mid'
              }`}
            >
              {fmtNetTotal(day.net, unitDollars)}
            </span>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {day.rows.map(bet => {
              const wash = bet.status === 'push' || bet.status === 'void';
              const won = bet.status === 'won';
              return (
                <li key={bet.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-hi/90">{slipTitle(bet)}</p>
                    <SlipMeta bet={bet} />
                  </div>
                  <KindChip bet={bet} />
                  <span
                    className={`tnum w-[76px] shrink-0 text-right font-mono text-[12px] font-bold ${
                      wash ? 'text-low' : won ? 'text-win' : 'text-loss'
                    }`}
                  >
                    {wash ? bet.status.toUpperCase() : fmtNet(bet.units_net ?? 0, unitDollars)}
                    {bet.odds_estimated && won ? <span className="font-normal text-low"> est</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
