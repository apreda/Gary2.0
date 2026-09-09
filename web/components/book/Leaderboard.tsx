'use client';

import Link from 'next/link';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { fetchRankings, type BoardScope, type BoardSort, type LeaderboardData, type RankedRow } from '@/lib/book/api';
import { supabaseBrowser } from '@/lib/auth/client';
import type { GaryRows } from '@/lib/book/gary';
import { bookButton } from './LogBet';
import { profileAvatar } from './ProfileEditor';
import { BlockedProfiles } from './BlockedProfiles';

const WINDOWS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'season', label: 'Season' },
] as const;
const SORTS: { key: BoardSort; label: string }[] = [
  { key: 'streak', label: 'Hot streaks' },
  { key: 'units', label: 'Net units' },
  { key: 'wins', label: 'Most wins' },
  { key: 'record', label: 'Win rate' },
];

export function Leaderboard({ garyRows }: { garyRows?: GaryRows }) {
  const [window_, setWindow] = useState<'7d' | '30d' | 'season'>('30d');
  const [sort, setSort] = useState<BoardSort>('streak');
  const [league, setLeague] = useState('all');
  const [scope, setScope] = useState<BoardScope>('all');
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [viewerID, setViewerID] = useState<string | null>(null);
  const signedIn = viewerID != null;
  const account = useRef<string | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    const { data: auth } = supabaseBrowser().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const owner = session?.user.id ?? null;
      if (owner === account.current) return;
      account.current = owner;
      requestVersion.current += 1;
      setViewerID(owner);
      if (!owner) setScope('all');
      setData(null);
      setError(null);
      setLoading(true);
      setMoreBusy(false);
      setAttempt((n) => n + 1);
    });
    return () => {
      requestVersion.current += 1;
      auth.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const request = ++requestVersion.current;
    fetchRankings(window_, sort, league, 0, scope)
      .then((next) => {
        if (!cancelled && request === requestVersion.current) {
          setData(next);
          setError(null);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled && request === requestVersion.current) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [window_, sort, league, scope, attempt]);
  const change = (fn: () => void) => {
    setLoading(true);
    setData(null);
    setError(null);
    fn();
  };
  const more = async () => {
    if (!data) return;
    const request = requestVersion.current;
    setMoreBusy(true);
    try {
      const next = await fetchRankings(window_, sort, league, data.rows.length, scope);
      if (request !== requestVersion.current) return;
      setData((prev) => (prev ? { ...next, rows: [...prev.rows, ...next.rows] } : next));
      setError(null);
    } catch (e) {
      if (request === requestVersion.current)
        setError(e instanceof Error ? e.message : 'The next page could not load.');
    } finally {
      if (request === requestVersion.current) setMoreBusy(false);
    }
  };
  const gary = league === 'all' ? garyRows?.[window_] : null;
  return (
    <section className="quant-panel overflow-hidden" aria-labelledby="leaderboard-heading">
      <div className="px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="leaderboard-heading" className="font-display text-2xl text-hi">
            The leaderboard
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-gold">
            Verified calls. Real records.
          </span>
        </div>
        {signedIn && (
          <div className="mt-4 flex items-center gap-4">
            {([['all', 'Everyone'], ['friends', 'Friends']] as [BoardScope, string][]).map(([key, label]) => (
              <button
                key={key}
                disabled={moreBusy}
                aria-pressed={scope === key}
                onClick={() => { if (scope !== key) change(() => setScope(key)); }}
                className={`py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${scope === key ? 'border-b border-gold text-hi' : 'text-mid'}`}
              >
                {label}
              </button>
            ))}
            {scope === 'friends' && data && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-low">{data.following_count ?? 0} followed</span>
            )}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {SORTS.map((s) => (
            <button
              key={s.key}
              disabled={moreBusy}
              aria-pressed={s.key === sort}
              onClick={() => { if (s.key !== sort) change(() => setSort(s.key)); }}
              className={`${bookButton} ${s.key === sort ? 'border-gold bg-gold/10 text-gold' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="my-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                disabled={moreBusy}
                aria-pressed={w.key === window_}
                onClick={() => { if (w.key !== window_) change(() => setWindow(w.key)); }}
                className={`py-1 text-[12px] ${w.key === window_ ? 'border-b border-gold text-gold' : 'text-mid'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <label className="text-[12px] text-mid">
            Sport{' '}
            <select
              disabled={moreBusy}
              value={league}
              onChange={(e) => change(() => setLeague(e.target.value))}
              className="ml-2 rounded-chip border border-line bg-chip px-3 py-2 text-hi"
            >
              {['all', 'MLB', 'NFL', 'NBA', 'NCAAF'].map((l) => (
                <option key={l} value={l}>
                  {l === 'all' ? 'All sports' : l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p className="border-y border-line bg-white/[0.02] px-5 py-3 text-[12px] leading-relaxed text-mid">
        Five decided, system-graded tails or fades in the selected window qualify you. Manual bets never rank.
        Net units are compared at a flat one-unit stake per pick. Hot streaks count your designated streak
        picks; pushes and voids leave the streak intact.
      </p>
      {signedIn && data && (
        <div className="border-b border-line px-5 py-4 text-[13px] text-mid">
          {data.profile_hidden ? (
            <>Your public profile is hidden by our safety controls. Your private Book remains available. <Link href="/terms#profile-safety" className="text-gold underline">Contact support to appeal</Link>.</>
          ) : data.me ? (
            <>
              Your place: <strong className="text-gold">#{data.me.rank}</strong> of {data.qualified_count}{' '}
              qualified players.
            </>
          ) : (
            <>
              {data.my_decided < data.min_decided
                ? `${data.my_decided}/${data.min_decided} decided calls · ${data.min_decided - data.my_decided} more to qualify. `
                : 'You have enough decided calls to qualify. '}
              Public rankings require a handle and a public profile.{' '}
              <Link href="/account" className="text-gold underline underline-offset-4">
                Profile settings
              </Link>
            </>
          )}
        </div>
      )}
      {loading ? (
        <p role="status" className="px-5 py-8 text-[13px] text-mid">
          Loading the standings…
        </p>
      ) : data && data.rows.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[550px] text-left">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-wider text-low">
                  <th className="py-3 pl-5">Rank / player</th>
                  <th>Record</th>
                  <th>Win %</th>
                  <th>Streak</th>
                  <th className="pr-5 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <RankingRow key={r.user_id} row={r} me={data.me?.user_id === r.user_id} />
                ))}
              </tbody>
            </table>
          </div>
          {data.me && !data.rows.some((r) => r.user_id === data.me!.user_id) && (
            <div className="border-t border-gold/20 bg-gold/5 p-4 text-sm text-gold">
              Your rank #{data.me.rank} · {data.me.display_name} · {data.me.wins}–{data.me.losses} ·{' '}
              {data.me.units.toFixed(2)}u
            </div>
          )}
          {data.has_more && (
            <div className="p-5">
              <button disabled={moreBusy} onClick={more} className={bookButton}>
                {moreBusy ? 'Loading…' : 'Show more players'}
              </button>
            </div>
          )}
        </>
      ) : (
        !error && (
          <div className="px-5 py-8">
            <p className="font-display text-xl text-hi">{scope === 'friends' ? 'Your friends board is empty.' : data?.hidden_count ? 'No players to show in this view.' : 'The next name could be yours.'}</p>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-mid">
              {scope === 'friends'
                ? ((data?.following_count ?? 0) === 0
                  ? 'Open any player from the board and tap Follow. Everyone you follow ranks here against you, with the same five-pick minimum.'
                  : 'None of the players you follow has five decided verified picks in this view yet.')
                : data?.hidden_count ? 'Your blocked players are hidden. Their results still count in the overall rankings.' : 'Nobody has qualified for this view yet. Build a record with five decided calls, choose your favorite pregame call for the streak, and make your profile public.'}
            </p>
            <Link
              href="/picks"
              className="mt-4 inline-block text-[13px] text-gold underline underline-offset-4"
            >
              Find your next pick →
            </Link>
          </div>
        )
      )}
      {error && (
        <div className="p-5">
          <p role="alert" className="text-[13px] text-loss">
            {error}
          </p>
          <button className={`${bookButton} mt-3`} onClick={() => change(() => setAttempt((n) => n + 1))}>
            Retry
          </button>
        </div>
      )}
      {gary && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 text-[12px]">
          <span className="text-gold">
            Gary&apos;s reference record <span className="text-low">· games + core props</span>
          </span>
          <span className="font-mono text-mid">
            {gary.wins}–{gary.losses}
            {gary.pushes ? `–${gary.pushes}` : ''} · {gary.units >= 0 ? '+' : ''}
            {gary.units.toFixed(1)}u
          </span>
        </div>
      )}
      {signedIn && <BlockedProfiles key={viewerID} onChange={() => change(() => setAttempt(n => n + 1))} />}
      <details className="border-t border-line px-5 py-4 text-[12px] leading-relaxed text-mid">
        <summary className="cursor-pointer text-gold">How the board works</summary>
        <p className="mt-3">
          Choose one verified game or prop as your streak pick for each Eastern date before it starts. A win
          adds one; a loss resets the winning streak. Skipping a day, a push, or a void does not penalize you.
          The streak column is your active run of designated picks in this sport, independent of the record
          window; W means wins and L means losses.
        </p>
        <p className="mt-2">
          Friends: follow players from their profile and the Friends view ranks them against you with the same rules.
          Who you follow is private and changes nothing for anyone else.
        </p>
        <p className="mt-2">
          Rankings require five wins or losses in the selected period; pushes do not qualify you. Streaks,
          wins, win rate, and flat-stake units offer different views of the same verified history. Home-run
          threats and self-graded bets are excluded. Gary is shown separately as a reference, with his public
          game and core-prop record.
        </p>
      </details>
    </section>
  );
}

function RankingRow({ row: r, me }: { row: RankedRow; me: boolean }) {
  const winning = ['W', 'win', 'won'].includes(r.streak_kind ?? '');
  return (
    <tr className={`border-t border-line ${me ? 'bg-gold/[0.06]' : ''}`}>
      <td className="py-4 pl-5">
        <div className="flex items-center gap-3">
          <span className="w-5 font-mono text-[12px] text-low">{r.rank}</span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line font-mono text-[11px] text-gold"
            aria-hidden
          >
            {profileAvatar(r.avatar, r.display_name)}
          </span>
          <Link
            href={`/players/${r.user_id}`}
            className="text-[13px] font-medium text-hi underline decoration-gold/20 underline-offset-4 hover:text-gold"
          >
            {r.display_name}
            {me && <span className="ml-2 text-[10px] text-gold">YOU</span>}
            {!me && r.following && <span className="ml-2 font-mono text-[9px] uppercase tracking-wider text-gold/70">Following</span>}
          </Link>
        </div>
      </td>
      <td className="font-mono text-[12px] text-mid">
        {r.wins}–{r.losses}
        {r.pushes ? `–${r.pushes}` : ''}
      </td>
      <td className="font-mono text-[12px] text-mid">
        {r.win_pct == null ? '—' : `${Number(r.win_pct).toFixed(0)}%`}
      </td>
      <td className={`font-mono text-[12px] ${winning ? 'text-[#E5844B]' : 'text-low'}`}>
        {r.streak_len ? `${winning ? 'W' : 'L'}${r.streak_len}` : '—'}
      </td>
      <td
        className={`pr-5 text-right font-mono text-[12px] ${r.units > 0 ? 'text-win' : r.units < 0 ? 'text-loss' : 'text-low'}`}
      >
        {r.units >= 0 ? '+' : ''}
        {Number(r.units).toFixed(2)}u
      </td>
    </tr>
  );
}
