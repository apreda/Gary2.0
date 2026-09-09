'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/auth/client';
import { myFollows, setFollow } from '@/lib/book/api';
import { bookButton } from './LogBet';
import { profileAvatar } from './ProfileEditor';
import { ProfileSafety } from './ProfileSafety';

type RecordLine = { wins: number; losses: number };
interface Card extends RecordLine {
  profile: { display_name: string; handle: string; bio: string | null; avatar: string | null } | null;
  graded: number;
  tail: RecordLine;
  fade: RecordLine;
  gary_on_same_picks: RecordLine;
  streak: { current: number; best: number; streak_len: number; streak_kind: string };
  window_start: string;
  window_end: string;
}
export function PublicProfile({ userId }: { userId: string }) {
  const [days, setDays] = useState(30);
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    let owner: string | null | undefined;
    const { data } = supabaseBrowser().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const next = session?.user.id ?? null;
      if (owner === next) return;
      owner = next; epoch.current += 1;
      setViewerId(next); setFollowing(null); setFollowError(null);
      setCard(null); setBlocked(false); setError(null); setLoading(true); setAttempt(n => n + 1);
    });
    return () => { epoch.current += 1; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const request = ++epoch.current;
    const load = async () => {
      try {
        const { data, error } = await supabaseBrowser().rpc('profile_card', { p_user: userId, p_days: days });
        if (cancelled || request !== epoch.current) return;
        if (error) throw error;
        setCard(data);
        setError(null);
      } catch {
        if (!cancelled && request === epoch.current) setError('This profile could not load. Please retry.');
      } finally {
        if (!cancelled && request === epoch.current) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, days, attempt]);
  useEffect(() => {
    // Following state resets in the auth handler; here we only read the list.
    if (!viewerId || viewerId === userId) return;
    let cancelled = false;
    const read = async () => {
      try {
        const rows = await myFollows();
        if (!cancelled) setFollowing(rows.some((r) => r.user_id === userId));
      } catch {
        if (!cancelled) setFollowing(false);
      }
    };
    void read();
    return () => { cancelled = true; };
  }, [viewerId, userId, attempt]);
  const toggleFollow = async () => {
    if (followBusy || following == null) return;
    const next = !following;
    setFollowBusy(true); setFollowError(null);
    try { await setFollow(userId, next); setFollowing(next); }
    catch (e) { setFollowError(e instanceof Error ? e.message : 'That change could not be saved.'); }
    finally { setFollowBusy(false); }
  };
  return (
    <div>
      <Link href="/leaderboard" className="text-[13px] text-gold underline underline-offset-4">
        ← Leaderboard
      </Link>
      {loading ? (
        <p role="status" className="mt-7 text-sm text-mid">
          Loading the player&apos;s record…
        </p>
      ) : error ? (
        <div className="mt-7">
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
          <button
            onClick={() => {
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
            className={`${bookButton} mt-3`}
          >
            Retry
          </button>
        </div>
      ) : !card?.profile ? (
        <div className="mt-7 rounded-panel border border-line bg-card p-7">
          <h1 className="font-display text-3xl text-hi">{blocked ? 'This player is blocked.' : 'This profile is unavailable.'}</h1>
          <p className="mt-2 text-sm text-mid">
            {blocked ? 'Unblock this player below to see their public profile again.' : 'This player has not shared a public profile, or it is no longer available.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-7 flex items-center gap-4">
            <span
              aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/50 font-mono text-2xl text-gold"
            >
              {profileAvatar(card.profile.avatar, card.profile.display_name)}
            </span>
            <div>
              <h1 className="font-display text-4xl text-hi">{card.profile.display_name}</h1>
              <p className="mt-1 text-[12px] text-gold">Verified Book record</p>
            </div>
          </div>
          {viewerId && viewerId !== userId && !blocked && following != null && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggleFollow}
                disabled={followBusy}
                aria-pressed={following}
                className={following ? `${bookButton} border-gold/60 text-gold` : 'rounded-chip bg-gold px-4 py-2 text-[12px] font-semibold text-ink disabled:opacity-50'}
              >
                {followBusy ? 'Updating…' : following ? 'Following' : 'Follow'}
              </button>
              <span className="text-[12px] text-mid">{following ? 'On your friends board.' : 'Follow to see this player on your friends board.'}</span>
              {followError && <span role="alert" className="text-[12px] text-loss">{followError}</span>}
            </div>
          )}
          {card.profile.bio && (
            <p className="mt-4 text-[14px] leading-relaxed text-mid">{card.profile.bio}</p>
          )}
          <div className="my-6 flex gap-2">
            {[7, 30, 365].map((n) => (
              <button
                key={n}
                aria-pressed={days === n}
                onClick={() => {
                  if (days === n) return;
                  setLoading(true);
                  setDays(n);
                }}
                className={`${bookButton} ${days === n ? 'border-gold text-gold' : ''}`}
              >
                {n === 365 ? 'Past year' : `${n} days`}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Record" value={`${card.wins}–${card.losses}`} />
            <Metric
              label="Win rate"
              value={card.graded ? `${Math.round((card.wins / card.graded) * 100)}%` : '—'}
            />
            <Metric label="Current winning streak" value={String(card.streak?.current ?? 0)} />
            <Metric label="Best streak" value={String(card.streak?.best ?? 0)} />
          </div>
          <div className="mt-5 rounded-panel border border-line bg-card p-5">
            <h2 className="font-display text-xl text-hi">Their calls, on the record</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                { label: 'With Gary', r: card.tail },
                { label: 'Fading Gary', r: card.fade },
                { label: 'Gary on the same calls', r: card.gary_on_same_picks },
              ].map(({ label, r }) => (
                <div key={label}>
                  <p className="text-[11px] text-low">{label}</p>
                  <p className="mt-1 font-mono text-lg text-hi">
                    {r.wins}–{r.losses}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-low">
              {card.window_start} through {card.window_end}. Decided game and core-prop calls only. Pushes and
              voids do not affect win rate. Streaks count designated picks across all dates. Manual bets,
              private notes, and personal stakes are not shared.
            </p>
          </div>
        </>
      )}
      <ProfileSafety key={userId} userId={userId} available={card?.profile != null} onBlockChange={value => {
        epoch.current += 1;
        setBlocked(value); setCard(null); setError(null);
        if (value) setLoading(false);
        else { setLoading(true); setAttempt(n => n + 1); }
      }} />
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-card p-5">
      <p className="text-[11px] text-low">{label}</p>
      <p className="mt-2 font-display text-3xl text-hi">{value}</p>
    </div>
  );
}
