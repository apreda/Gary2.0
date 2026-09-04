'use client';

import { useEffect, useState } from 'react';
import { fetchMyProfile, saveMyProfile, type MyProfile } from '@/lib/book/api';
import { useUnitDollars } from './BookDay';
import { bookButton, bookField } from './LogBet';

const AVATARS = [
  { key: 'initials', icon: 'Aa', label: 'Initials' },
  { key: 'flame.fill', icon: '🔥', label: 'Flame' },
  { key: 'baseball.fill', icon: '⚾', label: 'Baseball' },
  { key: 'basketball.fill', icon: '🏀', label: 'Basketball' },
  { key: 'football.fill', icon: '🏈', label: 'Football' },
  { key: 'bolt.fill', icon: '⚡', label: 'Bolt' },
  { key: 'target', icon: '◎', label: 'Target' },
  { key: 'crown.fill', icon: '♛', label: 'Crown' },
];
export function profileAvatar(value: string | null | undefined, handle: string) {
  return (
    AVATARS.find((a) => a.key === value && value !== 'initials')?.icon ?? handle.slice(0, 2).toUpperCase()
  );
}

export function ProfileEditor({
  initial,
  onSaved,
}: {
  initial?: MyProfile;
  onSaved?: (profile: MyProfile) => void;
}) {
  const [loaded, setLoaded] = useState(!!initial);
  const [profile, setProfile] = useState(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetchMyProfile()
      .then((p) => {
        if (!cancelled) {
          setProfile(p);
          setLoaded(true);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [initial, attempt]);
  if (!loaded)
    return (
      <div className="rounded-panel border border-line bg-card p-6">
        <p role={error ? 'alert' : 'status'} className="text-sm text-mid">
          {error ?? 'Loading your profile…'}
        </p>
        {error && (
          <button className={`${bookButton} mt-3`} onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        )}
      </div>
    );
  return <ProfileForm initial={profile!} onSaved={onSaved} />;
}

function ProfileForm({ initial, onSaved }: { initial: MyProfile; onSaved?: (profile: MyProfile) => void }) {
  const [handle, setHandle] = useState(initial.profile?.handle ?? initial.profile?.display_name ?? '');
  const [bio, setBio] = useState(initial.profile?.bio ?? '');
  const [avatar, setAvatar] = useState(initial.profile?.avatar ?? 'initials');
  const [visible, setVisible] = useState(initial.profile?.leaderboard_visible ?? false);
  const [sports, setSports] = useState(initial.preferences?.favorite_sports ?? []);
  const [unit, setUnit] = useState(String(initial.preferences?.unit_value ?? 0));
  const [, setUnitDollars] = useUnitDollars();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const p = await saveMyProfile({
        handle: handle.trim() || undefined,
        bio,
        avatar,
        visible,
        sports,
        unitValue: Number(unit),
      });
      setUnitDollars(Number(unit));
      onSaved?.(p);
      setFeedback('Profile saved. Your preferences sync with the app.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your profile could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="rounded-panel border border-line bg-card p-5 sm:p-6">
      <h2 className="font-display text-2xl text-hi">Your profile</h2>
      <p className="mt-1 text-[13px] text-mid">
        Make it yours. You control whether your verified record is public.
      </p>
      <fieldset disabled={busy} className="mt-5 space-y-5 disabled:opacity-60">
        <div>
          <p className="mb-2 text-[12px] text-mid">Avatar</p>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a.key}
                type="button"
                aria-label={a.label}
                aria-pressed={avatar === a.key}
                onClick={() => setAvatar(a.key)}
                className={`h-10 w-10 rounded-full border text-lg ${avatar === a.key ? 'border-gold bg-gold/10 text-gold' : 'border-line text-mid'}`}
              >
                {a.icon}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-[12px] text-mid">
          Public handle
          <input
            className={bookField}
            autoComplete="nickname"
            required
            minLength={3}
            maxLength={18}
            pattern="[A-Za-z0-9_]{3,18}"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Your name on the board"
          />
          <span className="mt-1 block text-[11px] text-low">3–18 letters, numbers, or underscores.</span>
        </label>
        <label className="block text-[12px] text-mid">
          Bio
          <textarea
            className={bookField}
            maxLength={160}
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="The sports you follow. The calls you stand by."
          />
        </label>
        <div>
          <p className="text-[12px] text-mid">Favorite sports</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {['MLB', 'NFL', 'NBA', 'NCAAF'].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sports.includes(s)}
                onClick={() => setSports((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))}
                className={`${bookButton} ${sports.includes(s) ? 'border-gold text-gold' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-[12px] text-mid">
          One unit in dollars
          <input
            type="number"
            min="0"
            max="100000"
            step="0.01"
            className={`${bookField} max-w-48`}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <span className="mt-1 block text-[11px] text-low">
            Set 0 to display units. This converts every stake and result in your private Book.
          </span>
        </label>
        <label className="flex items-start gap-3 text-[13px] leading-relaxed text-mid">
          <input
            type="checkbox"
            className="mt-1 accent-gold"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          <span>
            Show my handle, avatar, bio, and verified record on the public leaderboard.
            <span className="mt-1 block text-[11px] text-low">
              Your email, manual bets, notes, and dollar amounts stay private. Turn this off to leave public
              rankings.
            </span>
          </span>
        </label>
        <button className="rounded-chip bg-gold px-5 py-2.5 text-[13px] font-semibold text-ink">
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </fieldset>
      {feedback && (
        <p role="status" className="mt-3 text-[13px] text-win">
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-loss">
          {error}
        </p>
      )}
    </form>
  );
}
