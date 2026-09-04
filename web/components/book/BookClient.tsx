'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMyBets, fetchMyProfile, fetchMyStreak, type MyProfile, type UserStreak } from '@/lib/book/api';
import {
  betsCsv,
  bookRecord,
  cumulativeSeries,
  filterBets,
  fmtNetTotal,
  isVerified,
  searchBets,
  trackerStats,
  type Source,
  type Timeframe,
  type UserBet,
} from '@/lib/book/model';
import { supabaseBrowser } from '@/lib/auth/client';
import type { GaryRows } from '@/lib/book/gary';
import { useUnitDollars } from './BookDay';
import { Ledger, OpenSlips } from './BookSlips';
import { Leaderboard } from './Leaderboard';
import { bookButton, bookField, LogBet } from './LogBet';
import { ProfileEditor, profileAvatar } from './ProfileEditor';
import { RideChart } from './RideChart';

function RecordPanel({
  title,
  rows,
  unitDollars,
  verified,
}: {
  title: string;
  rows: UserBet[];
  unitDollars: number;
  verified?: boolean;
}) {
  const r = bookRecord(rows.filter((b) => b.status !== 'pending'));
  return (
    <div className={`rounded-panel border bg-card p-5 ${verified ? 'border-gold/35' : 'border-line'}`}>
      <p className={`font-mono text-[10px] uppercase tracking-widest ${verified ? 'text-gold' : 'text-low'}`}>
        {title}
      </p>
      <div className="mt-3 flex flex-wrap items-baseline gap-4">
        <span className="font-display text-3xl text-hi">
          {r.wins}–{r.losses}
          {r.pushes ? `–${r.pushes}` : ''}
        </span>
        <span className={`font-mono text-[13px] ${r.units >= 0 ? 'text-win' : 'text-loss'}`}>
          {fmtNetTotal(r.units, unitDollars)}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-low">
        {verified ? 'Tails + fades · settled automatically' : 'Manual bets · results entered by you'}
      </p>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-card px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-wider text-low">{label}</p>
      <p className="mt-1 font-display text-2xl text-hi">{value}</p>
    </div>
  );
}

export function BookClient({ garyRows }: { garyRows: GaryRows }) {
  const [bets, setBets] = useState<UserBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [streak, setStreak] = useState<UserStreak | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [source, setSource] = useState<Source>('all');
  const [search, setSearch] = useState('');
  const [league, setLeague] = useState('');
  const [status, setStatus] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [unitDollars, setUnitDollars] = useUnitDollars();
  const [reloadKey, setReloadKey] = useState(0);
  const requestVersion = useRef(0);
  const reload = useCallback(async () => {
    const request = ++requestVersion.current;
    try {
      const [rows, s, p] = await Promise.all([fetchMyBets(), fetchMyStreak(), fetchMyProfile()]);
      if (request !== requestVersion.current) return;
      setBets(rows);
      setStreak(s);
      setProfile(p);
      setUnitDollars(Number(p.preferences?.unit_value ?? 0));
      setError(null);
    } catch (e) {
      if (request === requestVersion.current)
        setError(e instanceof Error ? e.message : 'Your book could not load. Please retry.');
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, [setUnitDollars]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!cancelled) void reload();
    };
    const timer = window.setTimeout(load, 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 60000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    const { data: auth } = supabaseBrowser().auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') {
        requestVersion.current += 1;
        setBets([]);
        setProfile(null);
        setStreak(null);
        window.location.assign('/you');
      }
    });
    return () => {
      cancelled = true;
      requestVersion.current += 1;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      auth.subscription.unsubscribe();
    };
  }, [reload]);
  const handle = profile?.profile?.display_name;
  const filtered = searchBets(filterBets(bets, timeframe, source), search, league, status, favorites);
  const stats = trackerStats(filtered);
  const series = cumulativeSeries(filtered);
  const exportBook = () => {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', betsCsv(filtered)], { type: 'text/csv;charset=utf-8;' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'gary-your-book.csv';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const streakPicks = bets.filter((b) => b.streak_pick && b.status === 'pending');
  return (
    <div className="mt-7 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 font-mono text-lg text-gold"
          >
            {profileAvatar(profile?.profile?.avatar, handle ?? 'You')}
          </span>
          <div>
            <p className="font-display text-2xl text-hi">{handle ?? 'Your next chapter'}</p>
            <p className="mt-1 text-[11px] text-low">
              {profile?.profile?.leaderboard_visible
                ? 'Public verified record · private personal bets'
                : 'Your Book is private'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowProfile((v) => !v)} className={bookButton}>
            {showProfile ? 'Close profile' : 'Edit profile'}
          </button>
          <button
            onClick={() => setShowLog((v) => !v)}
            className="rounded-chip bg-gold px-4 py-2 text-[12px] font-semibold text-ink"
          >
            {showLog ? 'Close form' : '+ Log a bet'}
          </button>
        </div>
      </div>
      {error && (
        <div className="rounded-card border border-loss/35 p-4">
          <p role="alert" className="text-[13px] text-loss">
            {error}
          </p>
          <button onClick={reload} className={`${bookButton} mt-3`}>
            Retry
          </button>
          <Link href="/account?next=%2Fyou" className="ml-4 text-[12px] text-gold">
            Check sign-in
          </Link>
        </div>
      )}
      {showProfile && profile && (
        <ProfileEditor
          initial={profile}
          onSaved={(p) => {
            setProfile(p);
            setReloadKey((n) => n + 1);
          }}
        />
      )}
      {!loading && !profile?.profile?.handle && !showProfile && (
        <div className="rounded-card border border-gold/25 bg-card p-4 text-[13px] text-mid">
          Claim your handle and decide whether to join the rankings.{' '}
          <button className="text-gold underline underline-offset-4" onClick={() => setShowProfile(true)}>
            Set up your profile
          </button>
        </div>
      )}
      {showLog && (
        <LogBet
          onLogged={(bet) => {
            setBets((prev) => [bet, ...prev.filter((b) => b.id !== bet.id)]);
          }}
          onClose={() => setShowLog(false)}
        />
      )}
      {loading ? (
        <p role="status" className="py-8 text-[13px] text-mid">
          Opening your book…
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <RecordPanel
              title="With Gary · verified"
              rows={bets.filter(isVerified)}
              unitDollars={unitDollars}
              verified
            />
            <RecordPanel
              title="Your plays · private"
              rows={bets.filter((b) => b.kind === 'manual')}
              unitDollars={unitDollars}
            />
          </div>
          <section className="rounded-panel border border-[#E5844B]/25 bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#E5844B]">
                  Your streak
                </h2>
                <p className="mt-2 font-display text-3xl text-hi">
                  {streak?.current ?? 0} <span className="text-lg text-mid">correct picks in a row</span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[11px] text-low">PERSONAL BEST</p>
                <p className="font-display text-3xl text-[#E5844B]">{streak?.best ?? 0}</p>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-mid">
              Choose one verified call for each game date before it starts. Wins build your streak; a loss
              resets it. Pushes, voids, and days off leave it intact. Favorites are your private bookmarks and
              can include any bet.
            </p>
            {streakPicks.length > 0 ? (
              <div className="mt-3 space-y-1">
                {streakPicks.map((b) => (
                  <p key={b.id} className="text-[12px] text-gold">
                    Next up · {b.game_date} · {b.pick_text}
                  </p>
                ))}
              </div>
            ) : (
              <Link
                href="/picks"
                className="mt-3 inline-block text-[12px] text-gold underline underline-offset-4"
              >
                Find your next streak pick →
              </Link>
            )}
          </section>
          {bets.length > 0 ? (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {(['7d', '30d', 'season', 'all'] as Timeframe[]).map((t) => (
                      <button
                        key={t}
                        aria-pressed={timeframe === t}
                        onClick={() => setTimeframe(t)}
                        className={`${bookButton} ${timeframe === t ? 'border-gold text-gold' : ''}`}
                      >
                        {t === 'all' ? 'All time' : t === 'season' ? 'Season' : t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <button onClick={exportBook} disabled={!filtered.length} className={bookButton}>
                    Export CSV ({filtered.length})
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-[11px] text-mid">
                    Search your book
                    <input
                      className={bookField}
                      type="search"
                      placeholder="Selection, player, sportsbook, notes…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[11px] text-mid">
                      Source
                      <select
                        className={bookField}
                        value={source}
                        onChange={(e) => setSource(e.target.value as Source)}
                      >
                        <option value="all">All</option>
                        <option value="tail">Tails</option>
                        <option value="fade">Fades</option>
                        <option value="manual">Yours</option>
                      </select>
                    </label>
                    <label className="text-[11px] text-mid">
                      Sport
                      <select
                        className={bookField}
                        value={league}
                        onChange={(e) => setLeague(e.target.value)}
                      >
                        <option value="">All</option>
                        {[...new Set(bets.map((b) => b.league).filter(Boolean))].sort().map((l) => (
                          <option key={l} value={l!}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] text-mid">
                      Status
                      <select
                        className={bookField}
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="pending">Open</option>
                        <option value="settled">Settled</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                        <option value="push">Push</option>
                        <option value="void">Void</option>
                      </select>
                    </label>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-mid">
                  <input
                    type="checkbox"
                    className="accent-gold"
                    checked={favorites}
                    onChange={(e) => setFavorites(e.target.checked)}
                  />{' '}
                  Favorites only
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Win rate" value={stats.winPct == null ? '—' : `${stats.winPct}%`} />
                <Stat label="Return on stake" value={stats.roiPct == null ? '—' : `${stats.roiPct}%`} />
                <Stat
                  label="Average odds"
                  value={stats.avgOdds == null ? '—' : `${stats.avgOdds > 0 ? '+' : ''}${stats.avgOdds}`}
                />
                <Stat
                  label="Best day"
                  value={stats.bestDay ? fmtNetTotal(stats.bestDay.units, unitDollars) : '—'}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-low">
                Stats and chart follow your filters.{' '}
                {source === 'all'
                  ? 'This view includes both verified calls and your self-graded personal bets.'
                  : source === 'manual'
                    ? 'These results are self-graded and private.'
                    : 'These calls are graded by Gary’s result system.'}
              </p>
              {filtered.length ? (
                <>
                  <RideChart series={series} unitDollars={unitDollars} />
                  <OpenSlips bets={filtered} unitDollars={unitDollars} onChanged={reload} />
                  <Ledger bets={filtered} unitDollars={unitDollars} onChanged={reload} />
                </>
              ) : (
                <p className="rounded-card border border-line p-5 text-[13px] text-mid">
                  No bets match these filters. Change your search or date range to see more.
                </p>
              )}
            </>
          ) : (
            !error && (
              <div className="rounded-panel border border-line bg-card p-6">
                <h2 className="font-display text-2xl text-hi">Every record starts with one call.</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-mid">
                  Tail or fade a published pick to build your verified record, or log a bet you placed
                  elsewhere. This tracks predictions and never places a wager.
                </p>
                <div className="mt-4 flex gap-4">
                  <Link href="/picks" className="text-[13px] text-gold underline underline-offset-4">
                    Explore today&apos;s picks →
                  </Link>
                  <button
                    onClick={() => setShowLog(true)}
                    className="text-[13px] text-gold underline underline-offset-4"
                  >
                    Log your first bet
                  </button>
                </div>
              </div>
            )
          )}
        </>
      )}
      <Leaderboard key={reloadKey} garyRows={garyRows} myHandle={handle} />
    </div>
  );
}
