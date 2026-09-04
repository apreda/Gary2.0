'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/auth/client';
import { bookButton } from './LogBet';
import { profileAvatar } from './ProfileEditor';

type RecordLine = { wins: number; losses: number };
interface Card extends RecordLine {
  profile: { display_name: string; handle: string; bio: string | null; avatar: string | null };
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
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabaseBrowser().rpc('profile_card', { p_user: userId, p_days: days });
      if (cancelled) return;
      setLoading(false);
      if (error) setError('This profile could not load. Please retry.');
      else {
        setCard(data);
        setError(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, days, attempt]);
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
      ) : !card ? (
        <div className="mt-7 rounded-panel border border-line bg-card p-7">
          <h1 className="font-display text-3xl text-hi">This profile is private.</h1>
          <p className="mt-2 text-sm text-mid">
            This player has not shared a public profile, or it is no longer available.
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
          {card.profile.bio && (
            <p className="mt-4 text-[14px] leading-relaxed text-mid">{card.profile.bio}</p>
          )}
          <div className="my-6 flex gap-2">
            {[7, 30, 365].map((n) => (
              <button
                key={n}
                aria-pressed={days === n}
                onClick={() => {
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
