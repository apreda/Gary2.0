'use client';

import { useState } from 'react';
import { logManual } from '@/lib/book/api';
import type { UserBet } from '@/lib/book/model';
import { todayEST } from '@/lib/gary/dates';

const LEAGUES = ['MLB', 'NFL', 'NBA', 'NHL', 'NCAAF', 'NCAAB', 'OTHER'];

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

const field = `w-full rounded-chip border border-line bg-chip px-3.5 py-2.5 text-[14px] text-hi placeholder:text-low ${focusRing}`;

/**
 * Log an outside bet — YOUR PLAYS, self-graded and labeled that way. The
 * verified WITH GARY ledger never mixes with these.
 */
export function LogBet({ onLogged, onClose }: { onLogged: (bet: UserBet) => void; onClose: () => void }) {
  const [league, setLeague] = useState('MLB');
  const [description, setDescription] = useState('');
  const [oddsText, setOddsText] = useState('');
  const [stake, setStake] = useState(1.0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const desc = description.trim();
    if (!desc) return;
    let odds: number | null = null;
    if (oddsText.trim()) {
      const n = parseInt(oddsText.replace('+', ''), 10);
      if (!Number.isFinite(n) || Math.abs(n) < 100) {
        setError('Odds look off — use American odds like -110 or +145, or leave it blank.');
        return;
      }
      odds = n;
    }
    setBusy(true);
    setError(null);
    try {
      const bet = await logManual({ league, description: desc, odds, stake, gameDate: todayEST() });
      onLogged(bet);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not save that bet. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-card border border-line bg-card px-5 py-4">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold">Log a bet</p>
      <p className="mt-1 text-[13px] text-mid">
        A bet you placed elsewhere. It lands in YOUR PLAYS — you grade it when it settles.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={league}
          onChange={e => setLeague(e.target.value)}
          className={`rounded-chip border border-line bg-chip px-3 py-2.5 text-[13.5px] text-hi ${focusRing}`}
          aria-label="League"
        >
          {LEAGUES.map(l => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <input
          type="text"
          required
          placeholder="Yankees ML, Soto 2+ hits parlay, anything"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className={`${field} min-w-[220px] flex-1`}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          inputMode="numeric"
          placeholder="Odds (-110)"
          value={oddsText}
          onChange={e => setOddsText(e.target.value)}
          className={`${field} w-[130px]`}
        />
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
          Stake
          <select
            value={stake}
            onChange={e => setStake(parseFloat(e.target.value))}
            className={`rounded-chip border border-line bg-chip px-3 py-2.5 text-[13.5px] text-hi ${focusRing}`}
          >
            {[0.5, 1, 1.5, 2, 3, 5].map(s => (
              <option key={s} value={s}>
                {s.toFixed(1)}u
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !description.trim()}
          className={`rounded-chip bg-gold px-4 py-2.5 font-mono text-[12px] font-bold text-ink transition-opacity hover:opacity-90 disabled:opacity-50 ${focusRing}`}
        >
          Save it
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`font-mono text-[11.5px] text-low transition-colors hover:text-mid ${focusRing}`}
        >
          Cancel
        </button>
      </div>

      {error && <p className="mt-3 font-mono text-[11px] text-loss/90">{error}</p>}
    </form>
  );
}
