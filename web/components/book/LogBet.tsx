'use client';

import { useEffect, useRef, useState } from 'react';
import { logManual, scanSlip, updateBet, type ScannedBet } from '@/lib/book/api';
import type { UserBet } from '@/lib/book/model';
import { todayEST } from '@/lib/gary/dates';
import { logBookMilestone } from '@/lib/gary/analytics';
import { MarketSelect, TagInput } from './BookAnalytics';

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
  ownerId,
  isCurrent = () => true,
  tagSuggestions = [],
}: {
  onLogged: (bet: UserBet) => void;
  onClose: () => void;
  existing?: UserBet;
  ownerId?: string;
  isCurrent?: () => boolean;
  tagSuggestions?: string[];
}) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [league, setLeague] = useState(existing?.league ?? 'MLB');
  const [description, setDescription] = useState(existing?.pick_text ?? '');
  const [oddsText, setOddsText] = useState(String(existing?.odds_american ?? -110));
  const [stakeText, setStakeText] = useState(String(existing?.stake_units ?? 1));
  const [date, setDate] = useState(existing?.game_date ?? todayEST());
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [bookmaker, setBookmaker] = useState(existing?.bookmaker ?? '');
  const [favorite, setFavorite] = useState(existing?.is_favorite ?? false);
  const [market, setMarket] = useState<string | null>(existing?.market ?? null);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<ScannedBet[]>([]);
  const [scanBook, setScanBook] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  // The reader fills the form; the user still reviews and saves.
  const applyScan = (bet: ScannedBet, book: string | null) => {
    const legs = bet.legs.length > 1 ? ` — ${bet.legs.join(', ')}` : '';
    setDescription(`${bet.description}${legs}`.slice(0, 300));
    setLeague(LEAGUES.includes(bet.league) ? bet.league : 'OTHER');
    setMarket(bet.market);
    if (bet.odds_american != null) setOddsText(String(bet.odds_american));
    if (bet.game_date) setDate(bet.game_date);
    if (book && !bookmaker) setBookmaker(book);
    if (bet.stake_dollars != null) setScanNote(`The slip shows a $${bet.stake_dollars.toFixed(2)} stake. Enter it in units above.`);
    setError(null);
  };
  const scan = async (file: File | undefined) => {
    if (!file || scanning) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { setError('Choose a JPEG, PNG, WebP or GIF screenshot of the slip.'); return; }
    if (file.size > 6 * 1024 * 1024) { setError('That screenshot is too large. Crop it to the slip and try again.'); return; }
    setScanning(true); setError(null); setScanNote(null); setScanned([]);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(new Error('That image could not be read.'));
        reader.readAsDataURL(file);
      });
      const result = await scanSlip(base64, file.type);
      if (!active.current) return;
      setScanned(result.bets); setScanBook(result.sportsbook);
      if (result.bets[0]) applyScan(result.bets[0], result.sportsbook);
      if (result.bets.length > 1) setScanNote((n) => [n, `${result.bets.length} bets found. The first is loaded; save it, then load another.`].filter(Boolean).join(' '));
      else if (result.notes) setScanNote((n) => [n, result.notes].filter(Boolean).join(' '));
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : 'The slip could not be read.');
    } finally {
      if (active.current) setScanning(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !active.current || !isCurrent()) return;
    if (!existing && !ownerId) { setError('Reopen your book to confirm your account before saving.'); return; }
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
            market,
            tags,
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
            market,
            tags,
          }, ownerId!, () => active.current && isCurrent());
      if (!active.current || !isCurrent()) return;
      if (!existing) logBookMilestone('manual_bet_saved');
      onLogged(bet);
      onClose();
    } catch (err) {
      if (active.current && isCurrent()) setError(err instanceof Error ? err.message : 'We could not save that bet. Please retry.');
    } finally {
      if (active.current && isCurrent()) setBusy(false);
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
        {!existing && (
          <div className="rounded-card border border-gold/25 bg-gold/5 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className={`${bookButton} cursor-pointer border-gold/50 text-gold`}>
                {scanning ? 'Reading your slip…' : 'Scan a slip'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={scanning} onChange={(e) => { void scan(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <span className="text-[12px] text-mid">A screenshot of the slip fills this form. You still review and save it.</span>
            </div>
            {scanNote && <p className="mt-2 text-[12px] text-mid">{scanNote}</p>}
            {scanned.length > 1 && (
              <ul className="mt-2 space-y-1">
                {scanned.map((b, i) => (
                  <li key={`${b.description}-${i}`}>
                    <button type="button" onClick={() => applyScan(b, scanBook)} className={`${bookButton} w-full text-left`}>
                      {b.description} · {b.league}{b.odds_american != null ? ` · ${b.odds_american > 0 ? '+' : ''}${b.odds_american}` : ''}{b.stake_dollars != null ? ` · $${b.stake_dollars}` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
          Bet type <span className="text-low">(groups your breakdowns)</span>
          <MarketSelect value={market} onChange={setMarket} />
        </label>
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
        <div className={label}>
          Tags <span className="text-low">(optional · up to 8)</span>
          <div className="mt-1"><TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} /></div>
        </div>
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
