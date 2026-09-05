'use client';

import { useState } from 'react';
import { logManual, updateBet } from '@/lib/book/api';
import type { UserBet } from '@/lib/book/model';
import { todayEST } from '@/lib/gary/dates';
import { logBookMilestone } from '@/lib/gary/analytics';

const LEAGUES = ['MLB', 'NFL', 'NBA', 'NCAAF', 'OTHER'];
export const bookField =
  'mt-1 w-full rounded-chip border border-line bg-chip px-3.5 py-2.5 text-[14px] text-hi placeholder:text-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70';
export const bookButton =
  'rounded-chip border border-line px-3.5 py-2 text-[12px] font-medium text-mid transition-colors hover:border-gold/50 hover:text-hi disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70';
const label = 'block text-[12px] text-mid';

export function LogBet({
  onLogged,
  onClose,
  existing,
}: {
  onLogged: (bet: UserBet) => void;
  onClose: () => void;
  existing?: UserBet;
}) {
  const [league, setLeague] = useState(existing?.league ?? 'MLB');
  const [description, setDescription] = useState(existing?.pick_text ?? '');
  const [oddsText, setOddsText] = useState(String(existing?.odds_american ?? -110));
  const [stakeText, setStakeText] = useState(String(existing?.stake_units ?? 1));
  const [date, setDate] = useState(existing?.game_date ?? todayEST());
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [bookmaker, setBookmaker] = useState(existing?.bookmaker ?? '');
  const [favorite, setFavorite] = useState(existing?.is_favorite ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const desc = description.trim();
    const odds = Number(oddsText);
    const stake = Number(stakeText);
    if (!/^[+-]?\d+$/.test(oddsText.trim()) || Math.abs(odds) < 100 || Math.abs(odds) > 100000) {
      setError('Enter American odds, such as -110 or +145.');
      return;
    }
    if (!Number.isFinite(stake) || stake < 0.01 || stake > 10) {
      setError('Stake must be between 0.01 and 10 units.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const bet = existing
        ? await updateBet(existing.id, {
            league,
            pick_text: desc,
            description: desc,
            odds_american: odds,
            stake_units: stake,
            game_date: date,
            notes,
            bookmaker,
            is_favorite: favorite,
          })
        : await logManual({
            league,
            description: desc,
            odds,
            stake,
            gameDate: date,
            notes,
            bookmaker,
            favorite,
          });
      if (!existing) logBookMilestone('manual_bet_saved');
      onLogged(bet);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not save that bet. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-panel border border-gold/30 bg-card p-5 sm:p-6">
      <h2 className="font-display text-2xl text-hi">{existing ? 'Edit your bet' : 'Log your own bet'}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-mid">
        Your private record. Enter the odds you took and settle the result yourself. These bets never count
        toward public rankings or verified streaks.
      </p>
      <fieldset disabled={busy} className="mt-5 space-y-4 disabled:opacity-60">
        <label className={label}>
          Selection
          <input
            className={bookField}
            required
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Yankees moneyline, a player prop, or a parlay"
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={label}>
            Sport
            <select className={bookField} value={league} onChange={(e) => setLeague(e.target.value)}>
              {LEAGUES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Game date (Eastern)
            <input
              className={bookField}
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className={label}>
            American odds
            <input
              className={bookField}
              inputMode="text"
              required
              value={oddsText}
              onChange={(e) => setOddsText(e.target.value)}
            />
          </label>
          <label className={label}>
            Stake in units
            <input
              className={bookField}
              type="number"
              inputMode="decimal"
              min="0.01"
              max="10"
              step="0.01"
              required
              value={stakeText}
              onChange={(e) => setStakeText(e.target.value)}
            />
          </label>
        </div>
        <label className={label}>
          Sportsbook <span className="text-low">(optional)</span>
          <input
            className={bookField}
            maxLength={80}
            value={bookmaker}
            onChange={(e) => setBookmaker(e.target.value)}
            placeholder="Where you placed the bet"
          />
        </label>
        <label className={label}>
          Private notes <span className="text-low">(optional)</span>
          <textarea
            className={bookField}
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why you made this call"
          />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-mid">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
            className="accent-gold"
          />{' '}
          Save as a favorite
        </label>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!description.trim()}
            className="rounded-chip bg-gold px-5 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save bet'}
          </button>
          <button type="button" onClick={onClose} className={bookButton}>
            Cancel
          </button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-loss">
          {error}
        </p>
      )}
    </form>
  );
}
