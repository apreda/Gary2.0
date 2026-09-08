'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/auth/client';
import { fetchProfileSafety, reportProfile, setProfileBlock, PROFILE_HELP_URL, REPORT_REASONS, type ProfileSafetyState, type ReportReason } from '@/lib/book/profile-safety';
import { bookButton, bookField } from './LogBet';

export function ProfileSafety({ userId, available, onBlockChange }: {
  userId: string; available: boolean; onBlockChange: (blocked: boolean) => void;
}) {
  const [owner, setOwner] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<ProfileSafetyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const epoch = useRef(0);
  useEffect(() => {
    let account: string | null | undefined;
    const { data } = supabaseBrowser().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const next = session?.user.id ?? null;
      if (next === account) return;
      account = next; epoch.current += 1;
      setOwner(next); setState(null); setError(null); setBusy(false);
      setReporting(false); setDetails(''); setReceipt(null);
    });
    return () => { epoch.current += 1; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!owner) return;
    const request = ++epoch.current;
    fetchProfileSafety(userId).then(next => {
      if (request === epoch.current) { setState(next); setError(null); }
    }).catch((e: Error) => { if (request === epoch.current) setError(e.message); });
    return () => { epoch.current += 1; };
  }, [owner, userId, attempt]);
  const block = async () => {
    if (!state || busy) return;
    const request = epoch.current;
    const blocked = !state.blocked;
    setBusy(true); setError(null);
    try {
      await setProfileBlock(userId, blocked);
      if (request !== epoch.current) return;
      setState({ ...state, blocked }); onBlockChange(blocked);
    } catch (e) { if (request === epoch.current) setError(e instanceof Error ? e.message : 'This change could not be confirmed. Please retry.'); }
    finally { if (request === epoch.current) setBusy(false); }
  };
  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const request = epoch.current;
    setBusy(true); setError(null);
    try {
      const result = await reportProfile(userId, reason, details);
      if (request !== epoch.current) return;
      setReceipt(result); setReporting(false); setDetails('');
    } catch (e) { if (request === epoch.current) setError(e instanceof Error ? e.message : 'Your report could not be confirmed. Please retry.'); }
    finally { if (request === epoch.current) setBusy(false); }
  };
  if (state?.is_owner) return state.my_profile_hidden ? (
    <p role="status" className="mt-5 text-sm text-mid">Your public profile is hidden by our safety controls. Your private Book is available. <Link href={PROFILE_HELP_URL} className="text-gold underline">Contact support to appeal</Link>.</p>
  ) : null;
  if (owner === undefined || (!available && !state?.blocked && !error)) return null;
  return (
    <section aria-label="Profile safety" className="mt-6 border-t border-line pt-5 text-[13px] text-mid">
      {!owner ? (
        <p><Link href={`/account?next=${encodeURIComponent(`/players/${userId}`)}`} className="text-gold underline">Sign in to report or block this player</Link>. You can also <Link href={PROFILE_HELP_URL} className="text-gold underline">contact support</Link>.</p>
      ) : (
        <>
          {!state && !error && <p role="status" className="mb-3">Loading safety controls…</p>}
          {state?.blocked && <p role="status" className="mb-3">This player is blocked. Their profile and leaderboard entries are hidden from your signed-in account.</p>}
          <div className="flex flex-wrap gap-3">
            {state && <button onClick={() => void block()} disabled={busy} className={bookButton}>{state.blocked ? 'Unblock player' : 'Block player'}</button>}
            {state && !receipt && <button onClick={() => setReporting(v => !v)} disabled={busy} aria-expanded={reporting} className={bookButton}>Report profile</button>}
          </div>
          {receipt && <p role="status" className="mt-3">Report received. Gary’s support team can review the profile. Reference: {receipt}. Blocking is available separately.</p>}
          {reporting && <form onSubmit={submitReport} className="mt-4 space-y-3">
            <label className="block">What is wrong with this profile?
              <select value={reason} onChange={e => setReason(e.target.value as ReportReason)} className={`${bookField} mt-2 block w-full`} disabled={busy}>
                {REPORT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">Details (optional)
              <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={1000} rows={3} className={`${bookField} mt-2 block w-full`} disabled={busy} />
            </label>
            <p className="text-[12px] text-low">Include only what helps us review this public profile. Do not include passwords, payment details or private bet information. Reports are private.</p>
            <button type="submit" disabled={busy} className={bookButton}>{busy ? 'Sending…' : 'Send report'}</button>
          </form>}
          {error && <div className="mt-3"><p role="alert" className="text-loss">{error}</p>{!state && <button className={`${bookButton} mt-2`} onClick={() => setAttempt(n => n + 1)}>Retry safety controls</button>}</div>}
          <p className="mt-3 text-[12px] text-low">A block changes what you see; it does not change anyone’s results. <Link href={PROFILE_HELP_URL} className="text-gold underline">Community rules and support</Link>.</p>
        </>
      )}
    </section>
  );
}
